import {
  BadGatewayException,
  BadRequestException,
  Injectable,
} from '@nestjs/common';
import { ContasGatewayService } from '../contas-gateway/contas-gateway.service';
import { GatewayHttpService } from '../contas-gateway/gateway-http.service';
import { lerTransacaoGateway } from '../comum/contrato-transacao-gateway';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Transacao } from '../transacoes/entities/transacao.entity';
import { Saque } from '../saques/entities/saque.entity';
import {
  ConsultarExtratoDto,
  ESTADOS_EXTRATO,
  TIPOS_EXTRATO,
} from './dtos/operacoes-financeiras.dto';

@Injectable()
export class CarteiraService {
  constructor(
    private readonly contas: ContasGatewayService,
    private readonly gateway: GatewayHttpService,
    @InjectRepository(Transacao) private readonly locais: Repository<Transacao>,
    @InjectRepository(Saque) private readonly saques: Repository<Saque>,
  ) {}

  async consultar(usuarioId: string) {
    const token = await this.contas.obterToken(usuarioId);
    const retorno = await this.gateway.requisitar<unknown>('GET', '/wallet', {
      token,
    });
    if (
      !this.objeto(retorno) ||
      !this.texto(retorno.id) ||
      !this.texto(retorno.userId) ||
      !this.numero(retorno.balance) ||
      !this.texto(retorno.balanceFormatted) ||
      !this.texto(retorno.updatedAt)
    ) {
      throw new BadGatewayException(
        'Resposta de carteira incompatível com o contrato observado.',
      );
    }
    // Seleciona campos comprovados e preserva o saldo sem presumir sua unidade monetária.
    return {
      id: retorno.id,
      userId: retorno.userId,
      balance: retorno.balance,
      balanceFormatted: retorno.balanceFormatted,
      updatedAt: retorno.updatedAt,
    };
  }

  async consultarExtrato(usuarioId: string, consulta: ConsultarExtratoDto) {
    if (
      (consulta.limit !== undefined &&
        (!Number.isSafeInteger(consulta.limit) || consulta.limit < 1)) ||
      (consulta.status !== undefined &&
        !ESTADOS_EXTRATO.includes(consulta.status)) ||
      (consulta.type !== undefined && !TIPOS_EXTRATO.includes(consulta.type))
    ) {
      throw new BadRequestException('Filtros do extrato inválidos.');
    }
    const parametros = new URLSearchParams();
    if (consulta.status !== undefined)
      parametros.set('status', consulta.status);
    if (consulta.type !== undefined) parametros.set('type', consulta.type);
    if (consulta.limit !== undefined)
      parametros.set('limit', String(consulta.limit));
    const caminho = parametros.size
      ? `/wallet/transactions?${parametros}`
      : '/wallet/transactions';
    const token = await this.contas.obterToken(usuarioId);
    const retorno = await this.gateway.requisitar<unknown>('GET', caminho, {
      token,
    });
    if (
      !this.objeto(retorno) ||
      !this.texto(retorno.walletId) ||
      !this.numero(retorno.balance) ||
      !this.texto(retorno.balanceFormatted) ||
      !this.objeto(retorno.filters) ||
      retorno.filters.status !== (consulta.status ?? null) ||
      retorno.filters.type !== (consulta.type ?? null) ||
      !Array.isArray(retorno.transactions)
    ) {
      throw new BadGatewayException(
        'Resposta de extrato incompatível com o contrato observado.',
      );
    }
    const externas = retorno.transactions
      .map(lerTransacaoGateway)
      .map((item) => ({
        id: item.id,
        type: item.type,
        status: item.status,
        amount: item.amount,
        createdAt: item.createdAt,
        externalReference: item.externalReference,
      }));
    const [pagamentos, saques] = await Promise.all([
      this.locais.find({
        where: { usuarioId },
        select: {
          id: true,
          tipo: true,
          estado: true,
          valorCentavos: true,
          referenciaExterna: true,
          identificadorGateway: true,
          criadoEm: true,
        },
      }),
      this.saques.find({
        where: { usuarioId },
        select: {
          id: true,
          estado: true,
          valorCentavos: true,
          referenciaExterna: true,
          identificadorGateway: true,
          criadoEm: true,
        },
      }),
    ]);
    const estados: Record<string, (typeof externas)[number]['status']> = {
      PENDENTE: 'PENDING',
      APROVADA: 'APPROVED',
      APROVADO: 'APPROVED',
      NEGADA: 'DENIED',
      NEGADO: 'DENIED',
      EXPIRADA: 'EXPIRED',
      CANCELADA: 'CANCELLED',
    };
    const tipos: Record<string, (typeof externas)[number]['type']> = {
      PIX: 'PIX',
      CARTAO: 'CREDIT_CARD',
      SAQUE: 'WITHDRAWAL',
    };
    const internas = [
      ...pagamentos.map((item) => ({ ...item, type: tipos[item.tipo] })),
      ...saques.map((item) => ({ ...item, type: 'WITHDRAWAL' as const })),
    ].map((item) => ({
      id: item.identificadorGateway ?? `local:${item.type}:${item.id}`,
      type: item.type,
      status: estados[item.estado],
      amount: item.valorCentavos,
      createdAt: item.criadoEm.toISOString(),
      externalReference: item.referenciaExterna,
      identificadorGateway: item.identificadorGateway,
    }));
    const transacoes = [...externas];
    if (new Set(externas.map((item) => item.id)).size !== externas.length)
      throw new BadGatewayException(
        'Extrato externo contém identificadores duplicados.',
      );
    // O estado externo é a observação financeira atual; a consulta não altera o banco.
    for (const [indice, local] of internas.entries()) {
      if (
        local.identificadorGateway &&
        internas
          .slice(0, indice)
          .some(
            (item) => item.identificadorGateway === local.identificadorGateway,
          )
      )
        throw new BadGatewayException(
          'Registros locais com identificador externo duplicado.',
        );
      const candidatas = externas.filter((externa) =>
        local.identificadorGateway
          ? externa.id === local.identificadorGateway
          : local.externalReference !== null &&
            externa.externalReference === local.externalReference &&
            externa.type === local.type,
      );
      const referenciaUnica =
        internas.filter(
          (item) =>
            item.externalReference === local.externalReference &&
            item.type === local.type,
        ).length === 1;
      if (
        candidatas.length === 1 &&
        (local.identificadorGateway || referenciaUnica)
      ) {
        const externa = candidatas[0];
        if (
          externa.amount !== local.amount ||
          externa.type !== local.type ||
          (local.externalReference &&
            externa.externalReference &&
            local.externalReference !== externa.externalReference)
        )
          throw new BadGatewayException(
            'Extrato com valores ou referências divergentes.',
          );
        continue;
      }
      const { identificadorGateway: _identificador, ...item } = local;
      void _identificador;
      transacoes.push(item);
    }
    const consolidadas = transacoes
      .filter(
        (item) =>
          (!consulta.status || item.status === consulta.status) &&
          (!consulta.type || item.type === consulta.type),
      )
      .sort(
        (a, b) =>
          Date.parse(b.createdAt) - Date.parse(a.createdAt) ||
          a.id.localeCompare(b.id),
      );
    return {
      walletId: retorno.walletId,
      balance: retorno.balance,
      balanceFormatted: retorno.balanceFormatted,
      filters: { status: retorno.filters.status, type: retorno.filters.type },
      transactions:
        consulta.limit === undefined
          ? consolidadas
          : consolidadas.slice(0, consulta.limit),
    };
  }

  private objeto(valor: unknown): valor is Record<string, unknown> {
    return typeof valor === 'object' && valor !== null && !Array.isArray(valor);
  }

  private texto(valor: unknown): valor is string {
    return typeof valor === 'string' && valor.trim().length > 0;
  }

  private numero(valor: unknown): valor is number {
    return typeof valor === 'number' && Number.isFinite(valor);
  }
}
