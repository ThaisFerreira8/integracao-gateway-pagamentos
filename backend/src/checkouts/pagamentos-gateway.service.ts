import {
  BadGatewayException,
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { DataSource } from 'typeorm';
import { ContasGatewayService } from '../contas-gateway/contas-gateway.service';
import { GatewayHttpService } from '../contas-gateway/gateway-http.service';
import { lerTransacaoGateway } from '../comum/contrato-transacao-gateway';
import { EstadoPedido, Pedido } from '../pedidos/entities/pedido.entity';
import {
  EstadoTransacao,
  TipoTransacao,
  Transacao,
} from '../transacoes/entities/transacao.entity';
import {
  EstadoLinkCheckout,
  LinkCheckout,
  MetodoPagamento,
} from './entities/link-checkout.entity';
import { PagarPixDto, PagarCartaoDto } from './dtos/checkout.dto';
import { CheckoutsService } from './checkouts.service';

@Injectable()
export class PagamentosGatewayService {
  constructor(
    private readonly fonte: DataSource,
    private readonly contas: ContasGatewayService,
    private readonly gateway: GatewayHttpService,
    private readonly checkouts: CheckoutsService,
  ) {}

  async pagarPix(identificador: string, entrada: PagarPixDto) {
    return this.executar(identificador, MetodoPagamento.PIX, {
      payerDocument: entrada.documentoPagador,
    });
  }

  async pagarCartao(identificador: string, entrada: PagarCartaoDto) {
    const taxas = await this.checkouts.consultarTaxas(entrada.bandeira);
    const taxa = taxas.taxas.find((item) => item.parcelas === entrada.parcelas);
    if (!taxa) throw new BadRequestException('Parcelas indisponíveis.');
    return this.executar(
      identificador,
      MetodoPagamento.CARTAO,
      {
        cardNumber: entrada.numeroCartao,
        cardHolder: entrada.titularCartao,
        expiryMonth: entrada.mesValidade,
        expiryYear: entrada.anoValidade,
        cvv: entrada.codigoSeguranca,
        installments: entrada.parcelas,
        feePercent: taxa.taxaPercentual,
      },
      entrada,
    );
  }

  private async executar(
    identificador: string,
    metodo: MetodoPagamento,
    campos: Record<string, unknown>,
    cartao?: PagarCartaoDto,
  ) {
    const linkInicial = await this.fonte
      .getRepository(LinkCheckout)
      .findOneBy({ identificadorPublico: identificador });
    if (!linkInicial) throw new NotFoundException('Checkout não encontrado.');
    const token = await this.contas.obterToken(linkInicial.usuarioId);
    const reserva = await this.fonte.transaction(async (gerenciador) => {
      const link = await gerenciador.findOne(LinkCheckout, {
        where: { identificadorPublico: identificador },
        lock: { mode: 'pessimistic_write' },
      });
      if (!link) throw new NotFoundException('Checkout não encontrado.');
      const pedido = await gerenciador.findOneBy(Pedido, {
        linkCheckoutId: link.id,
      });
      if (!pedido) throw new NotFoundException('Pedido não encontrado.');
      const anterior = await gerenciador.findOneBy(Transacao, {
        pedidoId: pedido.id,
        usuarioId: link.usuarioId,
      });
      if (anterior)
        throw new ConflictException(
          'Este checkout já possui uma tentativa. Concilie antes de realizar outra operação.',
        );
      if (
        link.metodo !== metodo ||
        link.estado !== EstadoLinkCheckout.ATIVO ||
        link.expiraEm.getTime() <= Date.now()
      ) {
        throw new BadRequestException(
          'Checkout indisponível para este pagamento.',
        );
      }
      const transacao = await gerenciador.save(
        Transacao,
        gerenciador.create(Transacao, {
          id: randomUUID(),
          usuarioId: link.usuarioId,
          pedidoId: pedido.id,
          tipo:
            metodo === MetodoPagamento.PIX
              ? TipoTransacao.PIX
              : TipoTransacao.CARTAO,
          valorCentavos: link.valorCentavos,
          referenciaExterna: pedido.referenciaExterna,
          estado: EstadoTransacao.PENDENTE,
          identificadorGateway: null,
          taxaCentavos: null,
          valorLiquidoCentavos: null,
        }),
      );
      return { link, pedido, transacao };
    });
    // A reserva é durável antes do POST. Timeout/erro não libera repetição da cobrança.
    const resposta = await this.gateway.requisitar<unknown>(
      'POST',
      metodo === MetodoPagamento.PIX ? '/payments/pix' : '/payments/card',
      {
        token,
        corpo: {
          ...campos,
          amount: reserva.link.valorCentavos,
          externalReference: reserva.pedido.referenciaExterna,
        },
      },
    );
    const pagamento = lerTransacaoGateway(resposta);
    await this.persistir(
      reserva.pedido.id,
      reserva.link.usuarioId,
      pagamento,
      cartao,
      typeof campos.feePercent === 'number' ? campos.feePercent : undefined,
    );
    return this.apresentar(pagamento);
  }

  async conciliar(usuarioId: string, identificador: string) {
    const link = await this.fonte
      .getRepository(LinkCheckout)
      .findOneBy({ identificadorPublico: identificador, usuarioId });
    if (!link) throw new NotFoundException('Checkout não encontrado.');
    const pedido = await this.fonte
      .getRepository(Pedido)
      .findOneBy({ linkCheckoutId: link.id });
    if (!pedido) throw new NotFoundException('Pedido não encontrado.');
    const token = await this.contas.obterToken(usuarioId);
    let resposta: unknown;
    if (pedido.identificadorPagamentoGateway) {
      resposta = await this.gateway.requisitar(
        'GET',
        '/payments/' + encodeURIComponent(pedido.identificadorPagamentoGateway),
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
                item.externalReference === pedido.referenciaExterna &&
                item.type !== 'WITHDRAWAL',
            )
        : [];
      if (candidatos.length !== 1)
        throw new ConflictException(
          'Não foi possível localizar um único pagamento pela referência externa. Não repita a cobrança.',
        );
      resposta = extrato!.transactions!.find(
        (item) => lerTransacaoGateway(item).id === candidatos[0].id,
      );
    }
    const pagamento = lerTransacaoGateway(resposta);
    await this.persistir(pedido.id, usuarioId, pagamento);
    return this.apresentar(pagamento);
  }

  private async persistir(
    pedidoId: string,
    usuarioId: string,
    pagamento: ReturnType<typeof lerTransacaoGateway>,
    cartao?: PagarCartaoDto,
    percentual?: number,
  ) {
    await this.fonte.transaction(async (gerenciador) => {
      const pedido = await gerenciador.findOne(Pedido, {
        where: { id: pedidoId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!pedido) throw new NotFoundException('Pedido não encontrado.');
      const link = await gerenciador.findOneBy(LinkCheckout, {
        id: pedido.linkCheckoutId,
        usuarioId,
      });
      const transacao = await gerenciador.findOneBy(Transacao, {
        pedidoId,
        usuarioId,
      });
      if (
        !link ||
        !transacao ||
        pagamento.externalReference !== pedido.referenciaExterna ||
        pagamento.amount !== link.valorCentavos ||
        pagamento.type !==
          (link.metodo === MetodoPagamento.PIX ? 'PIX' : 'CREDIT_CARD') ||
        (pedido.identificadorPagamentoGateway &&
          pedido.identificadorPagamentoGateway !== pagamento.id)
      ) {
        throw new BadGatewayException(
          'Pagamento incompatível com o pedido local.',
        );
      }
      const estados = {
        PENDING: EstadoTransacao.PENDENTE,
        APPROVED: EstadoTransacao.APROVADA,
        DENIED: EstadoTransacao.NEGADA,
        EXPIRED: EstadoTransacao.EXPIRADA,
        CANCELLED: EstadoTransacao.CANCELADA,
      };
      // Não regride um resultado terminal em consultas atrasadas.
      if (
        transacao.estado !== EstadoTransacao.PENDENTE &&
        transacao.estado !== estados[pagamento.status]
      ) {
        throw new ConflictException(
          'O gateway retornou um estado divergente do resultado terminal registrado.',
        );
      }
      pedido.identificadorPagamentoGateway = pagamento.id;
      pedido.estado =
        pagamento.status === 'APPROVED'
          ? EstadoPedido.APROVADO
          : pagamento.status === 'DENIED'
            ? EstadoPedido.NEGADO
            : EstadoPedido.PENDENTE;
      transacao.identificadorGateway = pagamento.id;
      transacao.estado = estados[pagamento.status];
      transacao.taxaCentavos = pagamento.feeAmountCents;
      transacao.valorLiquidoCentavos = pagamento.netAmountCents;
      if (pagamento.status === 'APPROVED')
        link.estado = EstadoLinkCheckout.PAGO;
      if (pagamento.status === 'EXPIRED')
        link.estado = EstadoLinkCheckout.EXPIRADO;
      if (pagamento.status === 'CANCELLED')
        link.estado = EstadoLinkCheckout.CANCELADO;
      if (pagamento.type === 'CREDIT_CARD') {
        if (
          cartao &&
          (pagamento.bandeira !== cartao.bandeira ||
            pagamento.parcelas !== cartao.parcelas ||
            pagamento.taxaPercentual !== percentual)
        ) {
          throw new BadGatewayException(
            'Taxa ou bandeira retornada divergente da solicitação.',
          );
        }
        link.bandeira = pagamento.bandeira;
        link.parcelas = pagamento.parcelas;
        link.taxaAplicadaPercentual = pagamento.taxaPercentual!.toFixed(4);
      }
      await gerenciador.save(Pedido, pedido);
      await gerenciador.save(Transacao, transacao);
      await gerenciador.save(LinkCheckout, link);
    });
  }

  private apresentar(pagamento: ReturnType<typeof lerTransacaoGateway>) {
    return {
      identificadorPagamento: pagamento.id,
      estado: pagamento.status,
      valorCentavos: pagamento.amount,
      ...(pagamento.type === 'PIX'
        ? { emv: pagamento.emv, qrCodeBase64: pagamento.qrCodeBase64 }
        : {}),
    };
  }
}
