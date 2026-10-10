import {
  BadGatewayException,
  BadRequestException,
  Injectable,
} from '@nestjs/common';
import { ContasGatewayService } from '../contas-gateway/contas-gateway.service';
import { GatewayHttpService } from '../contas-gateway/gateway-http.service';
import { ConfigurarWebhookDto } from './dtos/configurar-webhook.dto';

@Injectable()
export class WebhooksService {
  constructor(
    private readonly contas: ContasGatewayService,
    private readonly gateway: GatewayHttpService,
  ) {}

  async configurar(
    usuarioId: string,
    entrada: ConfigurarWebhookDto,
  ): Promise<void> {
    const token = await this.contas.obterToken(usuarioId);
    const corpo = {
      event: entrada.event,
      url: entrada.url,
      ...(entrada.secret !== undefined ? { secret: entrada.secret } : {}),
    };
    // O cliente HTTP rejeita falhas; não interpreta o retorno como identidade ou estado de evento.
    await this.gateway.requisitar<unknown>('POST', '/webhooks', {
      token,
      corpo,
    });
  }

  async listar(usuarioId: string): Promise<unknown[]> {
    const token = await this.contas.obterToken(usuarioId);
    const retorno = await this.gateway.requisitar<unknown>('GET', '/webhooks', {
      token,
    });
    if (!Array.isArray(retorno) || retorno.length !== 0) {
      throw new BadGatewayException(
        'A estrutura dos itens de configuração de webhook ainda não foi confirmada.',
      );
    }
    return [];
  }

  async remover(usuarioId: string, id: string): Promise<void> {
    // Impede segmentos de navegação, separadores e controles sem impor um formato de identificador.
    if (
      typeof id !== 'string' ||
      !id.trim() ||
      id === '.' ||
      id === '..' ||
      /[\/\\\u0000-\u001f\u007f]/.test(id)
    ) {
      throw new BadRequestException(
        'Identificador inválido para um segmento de URL.',
      );
    }
    let segmento: string;
    try {
      segmento = encodeURIComponent(id);
    } catch {
      throw new BadRequestException(
        'Identificador inválido para um segmento de URL.',
      );
    }
    const token = await this.contas.obterToken(usuarioId);
    await this.gateway.requisitar<unknown>('DELETE', `/webhooks/${segmento}`, {
      token,
    });
  }
}
