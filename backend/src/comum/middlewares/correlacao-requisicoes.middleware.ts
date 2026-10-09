import { Injectable, Logger, type NestMiddleware } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import type { NextFunction, Request, Response } from 'express';

export type RequisicaoComCorrelacao = Request & {
  identificadorCorrelacao: string;
};

@Injectable()
export class CorrelacaoRequisicoesMiddleware implements NestMiddleware {
  private readonly logger = new Logger(CorrelacaoRequisicoesMiddleware.name);

  use(requisicao: Request, resposta: Response, proximo: NextFunction): void {
    const identificadorRecebido = requisicao.headers['x-correlation-id'];
    // Limita o cabeçalho a caracteres seguros para evitar injeção nos logs.
    const identificadorCorrelacao =
      typeof identificadorRecebido === 'string' &&
      /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/.test(identificadorRecebido)
        ? identificadorRecebido
        : randomUUID();

    (requisicao as RequisicaoComCorrelacao).identificadorCorrelacao =
      identificadorCorrelacao;
    resposta.setHeader('X-Correlation-Id', identificadorCorrelacao);

    const inicio = performance.now();
    const caminho = requisicao.originalUrl.split('?')[0];

    resposta.once('finish', () => {
      // Não inclui body, query string ou cabeçalhos de autenticação.
      this.logger.log({
        identificadorCorrelacao,
        metodo: requisicao.method,
        caminho,
        status: resposta.statusCode,
        duracaoMs: Number((performance.now() - inicio).toFixed(2)),
      });
    });

    proximo();
  }
}
