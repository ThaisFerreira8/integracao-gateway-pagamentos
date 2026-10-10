import {
  BadGatewayException,
  BadRequestException,
  Injectable,
} from '@nestjs/common';
import { ContasGatewayService } from '../contas-gateway/contas-gateway.service';
import { GatewayHttpService } from '../contas-gateway/gateway-http.service';
import { lerTransacaoGateway } from '../comum/contrato-transacao-gateway';
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
    const transacoes = retorno.transactions
      .map(lerTransacaoGateway)
      .map((item) => ({
        id: item.id,
        type: item.type,
        status: item.status,
        amount: item.amount,
        createdAt: item.createdAt,
        externalReference: item.externalReference,
      }));
    return {
      walletId: retorno.walletId,
      balance: retorno.balance,
      balanceFormatted: retorno.balanceFormatted,
      filters: { status: retorno.filters.status, type: retorno.filters.type },
      transactions: transacoes,
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
