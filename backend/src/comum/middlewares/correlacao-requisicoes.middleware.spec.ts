import { Logger } from '@nestjs/common';
import { EventEmitter } from 'node:events';
import type { Request, Response } from 'express';
import {
  CorrelacaoRequisicoesMiddleware,
  type RequisicaoComCorrelacao,
} from './correlacao-requisicoes.middleware';

describe('CorrelacaoRequisicoesMiddleware', () => {
  const criarRequisicao = (identificador?: string | string[]) =>
    ({
      headers: {
        'x-correlation-id': identificador,
        authorization: 'Bearer segredo-teste',
      },
      method: 'POST',
      originalUrl: '/pagamentos?senha=segredo-teste',
      body: { senha: 'segredo-teste', cvv: '123' },
    }) as unknown as Request;

  const criarResposta = () =>
    Object.assign(new EventEmitter(), {
      setHeader: jest.fn(),
      statusCode: 201,
    });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('gera um UUID e disponibiliza o mesmo identificador na requisição e resposta', () => {
    const requisicao = criarRequisicao();
    const resposta = criarResposta();
    const proximo = jest.fn();

    new CorrelacaoRequisicoesMiddleware().use(
      requisicao,
      resposta as unknown as Response,
      proximo,
    );

    const identificador = (requisicao as RequisicaoComCorrelacao)
      .identificadorCorrelacao;
    expect(identificador).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
    expect(resposta.setHeader).toHaveBeenCalledWith(
      'X-Correlation-Id',
      identificador,
    );
    expect(proximo).toHaveBeenCalledTimes(1);
  });

  it('preserva um identificador válido recebido', () => {
    const requisicao = criarRequisicao('pedido-123.tentativa_1');
    const resposta = criarResposta();

    new CorrelacaoRequisicoesMiddleware().use(
      requisicao,
      resposta as unknown as Response,
      jest.fn(),
    );

    expect(resposta.setHeader).toHaveBeenCalledWith(
      'X-Correlation-Id',
      'pedido-123.tentativa_1',
    );
  });

  it.each(['', 'a'.repeat(65), 'pedido\nlog-falso', ['id-1', 'id-2']])(
    'substitui cabeçalho inválido por um novo identificador (%j)',
    (identificador) => {
      const requisicao = criarRequisicao(identificador);
      const resposta = criarResposta();

      new CorrelacaoRequisicoesMiddleware().use(
        requisicao,
        resposta as unknown as Response,
        jest.fn(),
      );

      expect(
        (requisicao as RequisicaoComCorrelacao).identificadorCorrelacao,
      ).not.toEqual(identificador);
    },
  );

  it('registra o resultado uma vez, sem dados sensíveis', () => {
    const registrar = jest.spyOn(Logger.prototype, 'log').mockImplementation();
    const requisicao = criarRequisicao('pedido-123');
    const resposta = criarResposta();

    new CorrelacaoRequisicoesMiddleware().use(
      requisicao,
      resposta as unknown as Response,
      jest.fn(),
    );

    expect(registrar).not.toHaveBeenCalled();
    resposta.statusCode = 400;
    resposta.emit('finish');
    resposta.emit('finish');

    expect(registrar).toHaveBeenCalledTimes(1);
    expect(registrar).toHaveBeenCalledWith({
      identificadorCorrelacao: 'pedido-123',
      metodo: 'POST',
      caminho: '/pagamentos',
      status: 400,
      duracaoMs: expect.any(Number),
    });
    expect(JSON.stringify(registrar.mock.calls)).not.toContain('segredo-teste');
    expect(registrar.mock.calls[0][0].duracaoMs).toBeGreaterThanOrEqual(0);
  });
});
