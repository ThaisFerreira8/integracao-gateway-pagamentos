import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Brackets, In, Repository } from 'typeorm';
import { EstadoPedido, Pedido } from '../pedidos/entities/pedido.entity';
import {
  EstadoTransacao,
  TipoTransacao,
  Transacao,
} from '../transacoes/entities/transacao.entity';
import {
  ConsultarPagamentosDto,
  type FiltroEstadoPagamento,
} from './dtos/consultar-pagamentos.dto';

const ESTADOS_TRANSACAO: Record<FiltroEstadoPagamento, EstadoTransacao> = {
  APPROVED: EstadoTransacao.APROVADA,
  DENIED: EstadoTransacao.NEGADA,
  EXPIRED: EstadoTransacao.EXPIRADA,
  CANCELLED: EstadoTransacao.CANCELADA,
};

@Injectable()
export class PagamentosService {
  constructor(
    @InjectRepository(Pedido) private readonly pedidos: Repository<Pedido>,
    @InjectRepository(Transacao)
    private readonly transacoes: Repository<Transacao>,
  ) {}

  async listar(usuarioId: string, consulta: ConsultarPagamentosDto) {
    const busca = this.buscarDoLojista(usuarioId);
    if (consulta.referenciaExterna !== undefined) {
      busca.andWhere('pedido.referenciaExterna = :referenciaExterna', {
        referenciaExterna: consulta.referenciaExterna,
      });
    }
    if (consulta.status) {
      const transacaoComEstado = busca
        .subQuery()
        .select('1')
        .from(Transacao, 'transacaoFiltro')
        .where('transacaoFiltro.pedidoId = pedido.id')
        .andWhere('transacaoFiltro.usuarioId = :usuarioId')
        .andWhere('transacaoFiltro.tipo IN (:...tiposPagamento)')
        .andWhere('transacaoFiltro.estado = :estadoTransacao')
        .getQuery();
      const estadoPedido =
        consulta.status === 'APPROVED'
          ? EstadoPedido.APROVADO
          : consulta.status === 'DENIED'
            ? EstadoPedido.NEGADO
            : undefined;

      // Expiração do link não confirma expiração do pagamento. Não altera estados ao consultar.
      busca.andWhere(
        new Brackets((condicao) => {
          condicao.where(`EXISTS ${transacaoComEstado}`);
          if (estadoPedido) condicao.orWhere('pedido.estado = :estadoPedido');
        }),
        {
          estadoTransacao: ESTADOS_TRANSACAO[consulta.status],
          estadoPedido,
          tiposPagamento: [TipoTransacao.PIX, TipoTransacao.CARTAO],
        },
      );
    }
    const [pedidos, total] = await busca
      .orderBy('pedido.criadoEm', 'DESC')
      .addOrderBy('pedido.id', 'DESC')
      .skip((consulta.pagina - 1) * consulta.limite)
      .take(consulta.limite)
      .getManyAndCount();
    const transacoes = await this.buscarTransacoes(usuarioId, pedidos);
    return {
      dados: pedidos.map((pedido) => this.apresentar(pedido, transacoes)),
      pagina: consulta.pagina,
      limite: consulta.limite,
      total,
      totalPaginas: Math.ceil(total / consulta.limite),
    };
  }

  async consultar(usuarioId: string, id: string) {
    const pedido = await this.buscarDoLojista(usuarioId)
      .andWhere('pedido.id = :id', { id })
      .getOne();
    return this.apresentarConsulta(usuarioId, pedido);
  }

  async consultarReferencia(usuarioId: string, referenciaExterna: string) {
    const pedido = await this.buscarDoLojista(usuarioId)
      .andWhere('pedido.referenciaExterna = :referenciaExterna', {
        referenciaExterna,
      })
      .getOne();
    return this.apresentarConsulta(usuarioId, pedido);
  }

  private buscarDoLojista(usuarioId: string) {
    return this.pedidos
      .createQueryBuilder('pedido')
      .innerJoin('pedido.linkCheckout', 'link')
      .select([
        'pedido.id',
        'pedido.referenciaExterna',
        'pedido.estado',
        'pedido.criadoEm',
        'pedido.atualizadoEm',
        'link.id',
        'link.identificadorPublico',
        'link.valorCentavos',
        'link.metodo',
        'link.estado',
      ])
      .where('link.usuarioId = :usuarioId', { usuarioId });
  }

  private async buscarTransacoes(usuarioId: string, pedidos: Pedido[]) {
    if (!pedidos.length) return [];
    return this.transacoes.find({
      where: {
        usuarioId,
        pedidoId: In(pedidos.map((pedido) => pedido.id)),
        tipo: In([TipoTransacao.PIX, TipoTransacao.CARTAO]),
      },
      select: {
        id: true,
        pedidoId: true,
        tipo: true,
        estado: true,
        valorCentavos: true,
        taxaCentavos: true,
        valorLiquidoCentavos: true,
        criadoEm: true,
      },
      order: { criadoEm: 'DESC', id: 'DESC' },
    });
  }

  private async apresentarConsulta(usuarioId: string, pedido: Pedido | null) {
    // Ausência e falta de propriedade recebem a mesma resposta para não revelar pedidos alheios.
    if (!pedido) throw new NotFoundException('Pedido não encontrado.');
    return this.apresentar(
      pedido,
      await this.buscarTransacoes(usuarioId, [pedido]),
    );
  }

  private apresentar(pedido: Pedido, transacoes: Transacao[]) {
    return {
      id: pedido.id,
      referenciaExterna: pedido.referenciaExterna,
      estadoPedido: pedido.estado,
      criadoEm: pedido.criadoEm,
      atualizadoEm: pedido.atualizadoEm,
      checkout: {
        identificadorPublico: pedido.linkCheckout.identificadorPublico,
        valorCentavos: pedido.linkCheckout.valorCentavos,
        metodo: pedido.linkCheckout.metodo,
        estadoLink: pedido.linkCheckout.estado,
      },
      transacoes: transacoes
        .filter((transacao) => transacao.pedidoId === pedido.id)
        .map((transacao) => ({
          id: transacao.id,
          tipo: transacao.tipo,
          estado: transacao.estado,
          valorCentavos: transacao.valorCentavos,
          taxaCentavos: transacao.taxaCentavos,
          valorLiquidoCentavos: transacao.valorLiquidoCentavos,
          criadoEm: transacao.criadoEm,
        })),
    };
  }
}
