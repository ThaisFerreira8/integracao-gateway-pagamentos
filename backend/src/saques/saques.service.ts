import {
  BadGatewayException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, type FindOptionsSelect } from 'typeorm';
import { Saque, EstadoSaque } from './entities/saque.entity';
import { ContasGatewayService } from '../contas-gateway/contas-gateway.service';
import { GatewayHttpService } from '../contas-gateway/gateway-http.service';
import { SolicitarSaqueDto } from '../carteira/dtos/operacoes-financeiras.dto';
import { lerTransacaoGateway } from '../comum/contrato-transacao-gateway';

@Injectable()
export class SaquesService {
  private readonly camposPublicos: FindOptionsSelect<Saque> = {
    id: true,
    valorCentavos: true,
    referenciaExterna: true,
    estado: true,
    criadoEm: true,
    atualizadoEm: true,
  };

  constructor(
    @InjectRepository(Saque) private readonly saques: Repository<Saque>,
    private readonly contas: ContasGatewayService,
    private readonly gateway: GatewayHttpService,
  ) {}

  async solicitar(usuarioId: string, entrada: SolicitarSaqueDto) {
    const token = await this.contas.obterToken(usuarioId);
    const referenciaExterna =
      entrada.referenciaExterna ?? 'SAQUE-' + randomUUID();
    // Reserva a referência antes de chamar o gateway; não repete o POST em falhas.
    let saque: Saque;
    try {
      saque = await this.saques.save(
        this.saques.create({
          id: randomUUID(),
          usuarioId,
          valorCentavos: entrada.valorCentavos,
          chavePix: entrada.chavePix,
          documentoTitular: entrada.documentoTitular,
          referenciaExterna,
          estado: EstadoSaque.PENDENTE,
          identificadorGateway: null,
        }),
      );
    } catch (falha) {
      if (
        falha &&
        typeof falha === 'object' &&
        'code' in falha &&
        falha.code === 'ER_DUP_ENTRY'
      ) {
        throw new ConflictException(
          'Esta referência já possui uma tentativa de saque.',
        );
      }
      throw falha;
    }
    const resposta = await this.gateway.requisitar('POST', '/withdrawals', {
      token,
      corpo: {
        amount: entrada.valorCentavos,
        pixKey: entrada.chavePix,
        document: entrada.documentoTitular,
        externalReference: referenciaExterna,
        ...(entrada.descricao === undefined
          ? {}
          : { description: entrada.descricao }),
      },
    });
    await this.atualizar(saque, lerTransacaoGateway(resposta));
    return this.apresentar(saque);
  }

  async consultarExterno(usuarioId: string, id: string) {
    const saque = await this.saques.findOne({
      where: { id, usuarioId },
      select: {
        ...this.camposPublicos,
        identificadorGateway: true,
        usuarioId: true,
      },
    });
    if (!saque) throw new NotFoundException('Saque não encontrado.');
    const token = await this.contas.obterToken(usuarioId);
    let resposta: unknown;
    if (saque.identificadorGateway) {
      resposta = await this.gateway.requisitar(
        'GET',
        '/withdrawals/' + encodeURIComponent(saque.identificadorGateway),
        { token },
      );
    } else {
      const extrato = await this.gateway.requisitar<{
        transactions?: unknown[];
      }>('GET', '/wallet/transactions', { token });
      const candidatos = Array.isArray(extrato?.transactions)
        ? extrato.transactions
            .map(lerTransacaoGateway)
            .filter(
              (item) =>
                item.type === 'WITHDRAWAL' &&
                item.externalReference === saque.referenciaExterna,
            )
        : [];
      if (candidatos.length !== 1)
        throw new ConflictException(
          'Não foi possível localizar um único saque pela referência. Não repita a solicitação.',
        );
      resposta = extrato!.transactions!.find(
        (item) => lerTransacaoGateway(item).id === candidatos[0].id,
      );
    }
    await this.atualizar(saque, lerTransacaoGateway(resposta));
    return this.apresentar(saque);
  }

  private async atualizar(
    saque: Saque,
    externo: ReturnType<typeof lerTransacaoGateway>,
  ) {
    if (
      externo.type !== 'WITHDRAWAL' ||
      externo.amount !== saque.valorCentavos ||
      externo.externalReference !== saque.referenciaExterna ||
      (saque.identificadorGateway && saque.identificadorGateway !== externo.id)
    ) {
      throw new BadGatewayException(
        'Saque externo incompatível com o registro local.',
      );
    }
    if (!['PENDING', 'APPROVED', 'DENIED'].includes(externo.status)) {
      throw new BadGatewayException(
        'O estado externo não é representável pelo modelo local de saque.',
      );
    }
    const estado =
      externo.status === 'APPROVED'
        ? EstadoSaque.APROVADO
        : externo.status === 'DENIED'
          ? EstadoSaque.NEGADO
          : EstadoSaque.PENDENTE;
    // Atualização condicional impede regressão ou troca de identidade em consultas concorrentes.
    const resultado = await this.saques
      .createQueryBuilder()
      .update(Saque)
      .set({
        estado,
        identificadorGateway: externo.id,
      })
      .where('id = :id AND usuario_id = :usuarioId', {
        id: saque.id,
        usuarioId: saque.usuarioId,
      })
      .andWhere(
        '(identificador_gateway IS NULL OR identificador_gateway = :externo)',
        { externo: externo.id },
      )
      .andWhere('(estado = :pendente OR estado = :estado)', {
        pendente: EstadoSaque.PENDENTE,
        estado,
      })
      .execute();
    if (resultado.affected !== 1)
      throw new ConflictException(
        'Estado do saque divergente; consulta não aplicada.',
      );
    saque.estado = estado;
    saque.identificadorGateway = externo.id;
  }

  async listar(usuarioId: string) {
    const saques = await this.saques.find({
      where: { usuarioId },
      select: this.camposPublicos,
      order: { criadoEm: 'DESC', id: 'DESC' },
    });
    return saques.map((saque) => this.apresentar(saque));
  }

  async consultar(usuarioId: string, id: string) {
    const saque = await this.saques.findOne({
      where: { id, usuarioId },
      select: this.camposPublicos,
    });
    if (!saque) throw new NotFoundException('Saque não encontrado.');
    return this.apresentar(saque);
  }

  private apresentar(saque: Saque) {
    // Não carrega chave Pix, documento ou mensagens livres que possam conter dados sensíveis.
    return {
      id: saque.id,
      valorCentavos: saque.valorCentavos,
      referenciaExterna: saque.referenciaExterna,
      estado: saque.estado,
      criadoEm: saque.criadoEm,
      atualizadoEm: saque.atualizadoEm,
    };
  }
}
