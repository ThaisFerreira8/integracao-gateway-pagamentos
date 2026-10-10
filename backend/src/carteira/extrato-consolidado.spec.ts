import { BadGatewayException } from '@nestjs/common';
import { Repository } from 'typeorm';
import { CarteiraService } from './carteira.service';
import { ContasGatewayService } from '../contas-gateway/contas-gateway.service';
import { GatewayHttpService } from '../contas-gateway/gateway-http.service';
import {
  Transacao,
  EstadoTransacao,
  TipoTransacao,
} from '../transacoes/entities/transacao.entity';
import { Saque, EstadoSaque } from '../saques/entities/saque.entity';

describe('Extrato consolidado com isolamento por lojista', () => {
  const contas = { obterToken: jest.fn() };
  const gateway = { requisitar: jest.fn() };
  const pagamentos = { find: jest.fn() };
  const saques = { find: jest.fn() };
  const servico = new CarteiraService(
    contas as unknown as ContasGatewayService,
    gateway as unknown as GatewayHttpService,
    pagamentos as unknown as Repository<Transacao>,
    saques as unknown as Repository<Saque>,
  );
  const local = {
    id: 'registro-local',
    tipo: TipoTransacao.PIX,
    estado: EstadoTransacao.PENDENTE,
    valorCentavos: 1234,
    referenciaExterna: 'PEDIDO-teste',
    identificadorGateway: null,
    criadoEm: new Date('2026-10-01'),
  };
  const externa = {
    id: 'externo-confirmado',
    type: 'PIX',
    status: 'APPROVED',
    amount: 1234,
    createdAt: '2026-10-01T00:00:00.000Z',
    externalReference: 'PEDIDO-teste',
    metadata: { token: 'NUNCA-EXIBIR', document: 'NUNCA-EXIBIR' },
  };
  function retorno(
    transactions: unknown[],
    status: string | null = null,
    type: string | null = null,
  ) {
    return {
      walletId: 'carteira',
      balance: 12.34,
      balanceFormatted: '12,34',
      filters: { status, type },
      transactions,
    };
  }
  beforeEach(() => {
    jest.resetAllMocks();
    contas.obterToken.mockResolvedValue('token-mock');
    pagamentos.find.mockResolvedValue([local]);
    saques.find.mockResolvedValue([]);
    gateway.requisitar.mockResolvedValue(retorno([externa]));
  });

  it('une por referência única, usa o estado externo e não expõe metadados', async () => {
    const resultado = await servico.consultarExtrato('lojista-A', {});
    expect(resultado.transactions).toEqual([
      {
        id: externa.id,
        type: 'PIX',
        status: 'APPROVED',
        amount: 1234,
        createdAt: externa.createdAt,
        externalReference: externa.externalReference,
      },
    ]);
    expect(resultado.balance).toBe(12.34);
    expect(contas.obterToken).toHaveBeenCalledWith('lojista-A');
    for (const repositorio of [pagamentos, saques])
      expect(repositorio.find).toHaveBeenCalledWith(
        expect.objectContaining({ where: { usuarioId: 'lojista-A' } }),
      );
    expect(JSON.stringify(resultado)).not.toContain('NUNCA-EXIBIR');
  });

  it('une por identificador comprovado mesmo sem referência externa na resposta', async () => {
    pagamentos.find.mockResolvedValue([
      { ...local, identificadorGateway: externa.id },
    ]);
    gateway.requisitar.mockResolvedValue(
      retorno([{ ...externa, externalReference: undefined }]),
    );
    expect(
      (await servico.consultarExtrato('lojista-A', {})).transactions,
    ).toHaveLength(1);
  });

  it('preserva registros sem referência segura sem supor correspondência por valor ou data', async () => {
    pagamentos.find.mockResolvedValue([{ ...local, referenciaExterna: null }]);
    expect(
      (await servico.consultarExtrato('lojista-A', {})).transactions,
    ).toHaveLength(2);
  });

  it('não une uma referência ambígua entre dois registros locais', async () => {
    pagamentos.find.mockResolvedValue([
      local,
      { ...local, id: 'segunda-tentativa' },
    ]);
    expect(
      (await servico.consultarExtrato('lojista-A', {})).transactions,
    ).toHaveLength(3);
  });

  it('rejeita divergência de valor e duplicação de identificadores externos', async () => {
    gateway.requisitar.mockResolvedValueOnce(
      retorno([{ ...externa, amount: 100 }]),
    );
    await expect(
      servico.consultarExtrato('lojista-A', {}),
    ).rejects.toBeInstanceOf(BadGatewayException);
    gateway.requisitar.mockResolvedValueOnce(retorno([externa, externa]));
    await expect(
      servico.consultarExtrato('lojista-A', {}),
    ).rejects.toBeInstanceOf(BadGatewayException);
  });

  it('aplica filtros e limite aos registros locais, incluindo saques sem divulgar chave ou documento', async () => {
    gateway.requisitar.mockResolvedValue(retorno([], 'PENDING', 'WITHDRAWAL'));
    saques.find.mockResolvedValue([
      {
        id: 'saque-local',
        estado: EstadoSaque.PENDENTE,
        valorCentavos: 50,
        referenciaExterna: 'SAQUE-teste',
        identificadorGateway: null,
        criadoEm: new Date('2026-10-02'),
        chavePix: 'NUNCA-EXIBIR',
        documentoTitular: 'NUNCA-EXIBIR',
      },
    ]);
    const resultado = await servico.consultarExtrato('lojista-B', {
      status: 'PENDING',
      type: 'WITHDRAWAL',
      limit: 1,
    });
    expect(resultado.transactions).toEqual([
      expect.objectContaining({
        type: 'WITHDRAWAL',
        status: 'PENDING',
        amount: 50,
      }),
    ]);
    expect(gateway.requisitar).toHaveBeenCalledWith(
      'GET',
      '/wallet/transactions?status=PENDING&type=WITHDRAWAL&limit=1',
      { token: 'token-mock' },
    );
    expect(JSON.stringify(resultado)).not.toContain('NUNCA-EXIBIR');
  });
});
