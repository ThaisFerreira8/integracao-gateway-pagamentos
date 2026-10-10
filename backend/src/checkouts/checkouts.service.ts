import {
  BadGatewayException,
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { randomUUID } from 'node:crypto';
import { DataSource, Repository } from 'typeorm';
import { ContasGatewayService } from '../contas-gateway/contas-gateway.service';
import { GatewayHttpService } from '../contas-gateway/gateway-http.service';
import { EstadoPedido, Pedido } from '../pedidos/entities/pedido.entity';
import { CriarCheckoutDto } from './dtos/checkout.dto';
import {
  EstadoLinkCheckout,
  LinkCheckout,
  MetodoPagamento,
} from './entities/link-checkout.entity';
import type {
  BandeiraGateway,
  RetornoTaxasGateway,
} from './tipos/contrato-pagamentos-gateway';

@Injectable()
export class CheckoutsService {
  constructor(
    @InjectRepository(LinkCheckout)
    private readonly links: Repository<LinkCheckout>,
    private readonly fonte: DataSource,
    private readonly contas: ContasGatewayService,
    private readonly gateway: GatewayHttpService,
  ) {}

  async consultarTaxas(bandeira?: BandeiraGateway) {
    const caminho = bandeira
      ? `/fees?brand=${encodeURIComponent(bandeira)}`
      : '/fees';
    const retorno = await this.gateway.requisitar<RetornoTaxasGateway>(
      'GET',
      caminho,
    );
    if (
      !retorno ||
      !Number.isSafeInteger(retorno.total) ||
      !Array.isArray(retorno.fees) ||
      retorno.total !== retorno.fees.length ||
      retorno.fees.some(
        (taxa) =>
          !taxa ||
          !['VISA', 'MASTERCARD', 'ELO'].includes(taxa.brand) ||
          (bandeira && taxa.brand !== bandeira) ||
          !Number.isInteger(taxa.installments) ||
          taxa.installments < 1 ||
          taxa.installments > 21 ||
          typeof taxa.feePercent !== 'number' ||
          !Number.isFinite(taxa.feePercent) ||
          taxa.feePercent < 0 ||
          taxa.feePercent > 100 ||
          Number(taxa.feePercent.toFixed(4)) !== taxa.feePercent,
      )
    )
      throw new BadGatewayException(
        'A tabela de taxas do gateway é incompatível.',
      );

    return {
      total: retorno.total,
      taxas: retorno.fees.map((taxa) => ({
        bandeira: taxa.brand,
        parcelas: taxa.installments,
        taxaPercentual: taxa.feePercent,
      })),
    };
  }

  async criar(usuarioId: string, entrada: CriarCheckoutDto) {
    const expiraEm = new Date(entrada.expiraEm);
    if (
      !Number.isFinite(expiraEm.getTime()) ||
      expiraEm.getTime() <= Date.now()
    ) {
      throw new BadRequestException('A expiração deve ser uma data futura.');
    }
    await this.contas.obterToken(usuarioId);
    return this.fonte.transaction(async (gerenciador) => {
      const link = await gerenciador.save(
        LinkCheckout,
        gerenciador.create(LinkCheckout, {
          id: randomUUID(),
          identificadorPublico: randomUUID(),
          usuarioId,
          valorCentavos: entrada.valorCentavos,
          metodo: entrada.metodo,
          parcelas: null,
          bandeira: null,
          taxaAplicadaPercentual: null,
          estado: EstadoLinkCheckout.ATIVO,
          expiraEm,
        }),
      );
      const pedido = gerenciador.create(Pedido, {
        id: randomUUID(),
        linkCheckoutId: link.id,
        referenciaExterna: `PEDIDO-${randomUUID()}`,
        identificadorPagamentoGateway: null,
        estado: EstadoPedido.PENDENTE,
      });
      await gerenciador.save(Pedido, pedido);
      return this.apresentarLink(link);
    });
  }

  async listar(usuarioId: string) {
    const links = await this.links.find({
      where: { usuarioId },
      order: { criadoEm: 'DESC' },
    });
    return links.map((link) => this.apresentarLink(link));
  }

  async consultarPublico(identificador: string) {
    const link = await this.obterLink(identificador);
    const taxas =
      link.metodo === MetodoPagamento.CARTAO &&
      link.estado === EstadoLinkCheckout.ATIVO &&
      link.expiraEm.getTime() > Date.now()
        ? await this.consultarTaxas()
        : undefined;
    return { ...this.apresentarLink(link), taxas: taxas?.taxas };
  }

  private async obterLink(identificador: string) {
    const link = await this.links.findOneBy({
      identificadorPublico: identificador,
    });
    if (!link) throw new NotFoundException('Checkout não encontrado.');
    return link;
  }

  private apresentarLink(link: LinkCheckout) {
    return {
      identificadorPublico: link.identificadorPublico,
      caminhoCheckout: `/checkout/${link.identificadorPublico}`,
      valorCentavos: link.valorCentavos,
      metodo: link.metodo,
      parcelas: link.parcelas,
      bandeira: link.bandeira,
      taxaAplicadaPercentual: link.taxaAplicadaPercentual,
      estado:
        link.estado === EstadoLinkCheckout.ATIVO &&
        link.expiraEm.getTime() <= Date.now()
          ? EstadoLinkCheckout.EXPIRADO
          : link.estado,
      expiraEm: link.expiraEm,
    };
  }
}
