import {
  BadGatewayException,
  BadRequestException,
  NotFoundException,
  ValidationPipe,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { Repository } from 'typeorm';
import type { RequisicaoAutenticada } from '../autenticacao/guards/autenticacao.guard';
import { ContasGatewayService } from '../contas-gateway/contas-gateway.service';
import { GatewayHttpService } from '../contas-gateway/gateway-http.service';
import { Saque } from '../saques/entities/saque.entity';
import { Transacao } from '../transacoes/entities/transacao.entity';
import { SaquesController } from '../saques/saques.controller';
import { SaquesService } from '../saques/saques.service';
import { CarteiraController } from './carteira.controller';
import { CarteiraService } from './carteira.service';
import {
  ConsultarExtratoDto,
  SolicitarSaqueDto,
} from './dtos/operacoes-financeiras.dto';

describe('Carteira, extrato e consultas locais de saques', () => {
  const usuarioId = randomUUID();
  const outroUsuarioId = randomUUID();
  const contas = { obterToken: jest.fn() };
  const gateway = { requisitar: jest.fn() };
  const repositorio = { find: jest.fn(), findOne: jest.fn() };
  const carteira = new CarteiraService(
    contas as unknown as ContasGatewayService,
    gateway as unknown as GatewayHttpService,
    {
      find: jest.fn().mockResolvedValue([]),
    } as unknown as Repository<Transacao>,
    { find: jest.fn().mockResolvedValue([]) } as unknown as Repository<Saque>,
  );
  const saques = new SaquesService(
    repositorio as unknown as Repository<Saque>,
    contas as unknown as ContasGatewayService,
    gateway as unknown as GatewayHttpService,
  );
  const pipe = new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
  });
  const saldo = {
    id: randomUUID(),
    userId: randomUUID(),
    balance: 12.34,
    balanceFormatted: '12,34',
    updatedAt: new Date().toISOString(),
  };
  const extrato = {
    walletId: saldo.id,
    balance: saldo.balance,
    balanceFormatted: saldo.balanceFormatted,
    filters: { status: null, type: null },
    transactions: [],
  };
  const saque = {
    id: randomUUID(),
    usuarioId,
    valorCentavos: 1234,
    referenciaExterna: 'SAQUE-LOCAL',
    estado: 'PENDENTE',
    criadoEm: new Date(),
    atualizadoEm: new Date(),
    chavePix: 'NAO-EXIBIR',
    documentoTitular: 'NAO-EXIBIR',
    motivoNegacao: 'NAO-EXIBIR',
    token: 'NAO-EXIBIR',
  };

  beforeEach(() => {
    contas.obterToken
      .mockReset()
      .mockImplementation(async (proprietario: string) =>
        proprietario === usuarioId ? 'token-A-ficticio' : 'token-B-ficticio',
      );
    gateway.requisitar.mockReset();
    repositorio.find.mockReset().mockResolvedValue([saque]);
    repositorio.findOne
      .mockReset()
      .mockImplementation(
        async ({ where }: { where: { id: string; usuarioId: string } }) =>
          where.id === saque.id && where.usuarioId === usuarioId ? saque : null,
      );
  });

  it('consulta saldo com o token do proprietário e preserva o número sem conversão', async () => {
    gateway.requisitar.mockResolvedValueOnce({
      ...saldo,
      token: 'NAO-EXIBIR',
      chaveLoja: 'NAO-EXIBIR',
    });
    expect(await carteira.consultar(usuarioId)).toEqual(saldo);
    expect(contas.obterToken).toHaveBeenCalledWith(usuarioId);
    expect(gateway.requisitar).toHaveBeenCalledWith('GET', '/wallet', {
      token: 'token-A-ficticio',
    });
  });

  it('contas diferentes utilizam tokens diferentes, sem credenciais globais', async () => {
    gateway.requisitar.mockResolvedValue(saldo);
    await carteira.consultar(usuarioId);
    await carteira.consultar(outroUsuarioId);
    expect(
      gateway.requisitar.mock.calls.map((chamada) => chamada[2].token),
    ).toEqual(['token-A-ficticio', 'token-B-ficticio']);
  });

  it('não chama o gateway quando o vínculo está indisponível', async () => {
    contas.obterToken.mockRejectedValueOnce(
      new BadRequestException('Vínculo necessário.'),
    );
    await expect(carteira.consultar(usuarioId)).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(gateway.requisitar).not.toHaveBeenCalled();
  });

  it.each([
    null,
    [],
    { ...saldo, balance: '12.34' },
    { ...saldo, balance: Infinity },
    { ...saldo, userId: '' },
    { ...saldo, updatedAt: null },
  ])('rejeita carteira incompatível: %j', async (resposta) => {
    gateway.requisitar.mockResolvedValueOnce(resposta);
    await expect(carteira.consultar(usuarioId)).rejects.toBeInstanceOf(
      BadGatewayException,
    );
  });

  it('preserva o envelope vazio confirmado, sem filtros ou limite presumidos', async () => {
    gateway.requisitar.mockResolvedValueOnce({
      ...extrato,
      token: 'NAO-EXIBIR',
      filters: { ...extrato.filters, senha: 'NAO-EXIBIR' },
    });
    expect(await carteira.consultarExtrato(usuarioId, {})).toEqual(extrato);
    expect(gateway.requisitar).toHaveBeenCalledWith(
      'GET',
      '/wallet/transactions',
      { token: 'token-A-ficticio' },
    );
  });

  it('encaminha exatamente status, type e limit documentados', async () => {
    const consulta: ConsultarExtratoDto = {
      status: 'APPROVED',
      type: 'PIX',
      limit: 5000,
    };
    gateway.requisitar.mockResolvedValueOnce({
      ...extrato,
      filters: { status: 'APPROVED', type: 'PIX' },
    });
    expect(
      (await carteira.consultarExtrato(usuarioId, consulta)).filters,
    ).toEqual({ status: 'APPROVED', type: 'PIX' });
    expect(gateway.requisitar).toHaveBeenCalledWith(
      'GET',
      '/wallet/transactions?status=APPROVED&type=PIX&limit=5000',
      { token: 'token-A-ficticio' },
    );
  });

  it.each(['PENDING', 'APPROVED', 'DENIED', 'EXPIRED', 'CANCELLED'] as const)(
    'aceita o filtro de status %s',
    async (status) => {
      expect(
        await pipe.transform(
          { status },
          { type: 'query', metatype: ConsultarExtratoDto },
        ),
      ).toMatchObject({ status });
    },
  );

  it.each(['PIX', 'CREDIT_CARD', 'WITHDRAWAL'] as const)(
    'aceita o filtro de tipo %s',
    async (type) => {
      expect(
        await pipe.transform(
          { type },
          { type: 'query', metatype: ConsultarExtratoDto },
        ),
      ).toMatchObject({ type });
    },
  );

  it.each([
    { limit: '0' },
    { limit: '-1' },
    { limit: '1.5' },
    { limit: '1e2' },
    { limit: '' },
    { limit: '9007199254740992' },
    { status: 'SUCESSO' },
    { type: 'CARTAO' },
    { page: '1' },
    { offset: '0' },
    { cursor: 'x' },
    { usuarioId },
  ])('rejeita filtro inválido ou não documentado: %j', async (consulta) => {
    await expect(
      pipe.transform(consulta, {
        type: 'query',
        metatype: ConsultarExtratoDto,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('aceita inteiro positivo sem impor um máximo presumido do gateway', async () => {
    expect(
      await pipe.transform(
        { limit: '5000' },
        { type: 'query', metatype: ConsultarExtratoDto },
      ),
    ).toMatchObject({ limit: 5000 });
    await expect(
      carteira.consultarExtrato(usuarioId, { limit: 1.5 }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(gateway.requisitar).not.toHaveBeenCalled();
  });

  it.each([
    null,
    { ...extrato, transactions: {} },
    { ...extrato, balance: NaN },
    { ...extrato, filters: null },
    { ...extrato, filters: { status: 'DENIED', type: null } },
  ])('rejeita envelope do extrato incompatível: %j', async (resposta) => {
    gateway.requisitar.mockResolvedValueOnce(resposta);
    await expect(
      carteira.consultarExtrato(usuarioId, {}),
    ).rejects.toBeInstanceOf(BadGatewayException);
  });

  it('seleciona campos comprovados de extrato não vazio, sem dados sensíveis', async () => {
    gateway.requisitar.mockResolvedValueOnce({
      ...extrato,
      transactions: [
        {
          id: 'externo',
          type: 'PIX',
          status: 'DENIED',
          amount: 1,
          createdAt: '2026-10-10T12:00:00.000Z',
          metadata: {
            externalReference: 'PEDIDO-teste',
            ChaveLoja: 'NAO-EXPOR',
            payerDocument: 'NAO-EXPOR',
          },
        },
      ],
    });
    const retorno = await carteira.consultarExtrato(usuarioId, {});
    expect(retorno.transactions).toEqual([
      {
        id: 'externo',
        type: 'PIX',
        status: 'DENIED',
        amount: 1,
        createdAt: '2026-10-10T12:00:00.000Z',
        externalReference: 'PEDIDO-teste',
      },
    ]);
    expect(JSON.stringify(retorno)).not.toContain('NAO-EXPOR');
  });

  it('não expõe itens desconhecidos nem os transforma em extrato vazio', async () => {
    gateway.requisitar.mockResolvedValueOnce({
      ...extrato,
      transactions: [{ senha: 'NAO-EXIBIR' }],
    });
    await expect(
      carteira.consultarExtrato(usuarioId, {}),
    ).rejects.toMatchObject({
      message: 'Resposta financeira incompatível com o contrato observado.',
    });
  });

  it('lista saques locais com proprietário e seleção explícita de campos seguros', async () => {
    const resultado = await saques.listar(usuarioId);
    const consulta = repositorio.find.mock.calls[0][0];
    expect(consulta.where).toEqual({ usuarioId });
    expect(consulta.select).not.toHaveProperty('chavePix');
    expect(consulta.select).not.toHaveProperty('documentoTitular');
    expect(consulta.select).not.toHaveProperty('motivoNegacao');
    expect(JSON.stringify(resultado)).not.toContain('NAO-EXIBIR');
    expect(resultado[0]).toMatchObject({
      id: saque.id,
      valorCentavos: 1234,
      estado: 'PENDENTE',
    });
    expect(gateway.requisitar).not.toHaveBeenCalled();
  });

  it('consulta saque individual exige simultaneamente ID local e proprietário', async () => {
    expect((await saques.consultar(usuarioId, saque.id)).id).toBe(saque.id);
    await expect(
      saques.consultar(outroUsuarioId, saque.id),
    ).rejects.toBeInstanceOf(NotFoundException);
    await expect(
      saques.consultar(usuarioId, randomUUID()),
    ).rejects.toMatchObject({ message: 'Saque não encontrado.' });
    expect(gateway.requisitar).not.toHaveBeenCalled();
  });

  it('controllers utilizam somente a identidade autenticada', async () => {
    const requisicao = {
      usuarioAutenticado: { id: usuarioId },
      query: { usuarioId: outroUsuarioId },
    } as unknown as RequisicaoAutenticada;
    gateway.requisitar
      .mockResolvedValueOnce(saldo)
      .mockResolvedValueOnce(extrato);
    const controllerCarteira = new CarteiraController(carteira);
    await controllerCarteira.consultar(requisicao);
    await controllerCarteira.consultarExtrato(requisicao, {});
    const controllerSaques = new SaquesController(saques);
    await controllerSaques.listar(requisicao);
    await controllerSaques.consultar(requisicao, saque.id);
    expect(contas.obterToken.mock.calls.every(([id]) => id === usuarioId)).toBe(
      true,
    );
    expect(repositorio.findOne.mock.calls[0][0].where).toEqual({
      id: saque.id,
      usuarioId,
    });
  });

  it('valida apenas a entrada confirmada de saque, sem executar operação', async () => {
    const entrada = {
      valorCentavos: 1000,
      chavePix: 'teste@example.com',
      documentoTitular: '11111111111',
    };
    expect(
      await pipe.transform(entrada, {
        type: 'body',
        metatype: SolicitarSaqueDto,
      }),
    ).toBeInstanceOf(SolicitarSaqueDto);
    await expect(
      pipe.transform(
        { ...entrada, documentoTitular: '11111111111111' },
        { type: 'body', metatype: SolicitarSaqueDto },
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      pipe.transform(
        { ...entrada, valorCentavos: 1.5 },
        { type: 'body', metatype: SolicitarSaqueDto },
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      pipe.transform(
        { ...entrada, usuarioId },
        { type: 'body', metatype: SolicitarSaqueDto },
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(gateway.requisitar).not.toHaveBeenCalled();
  });
});
