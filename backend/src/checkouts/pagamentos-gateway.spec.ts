import {
  BadGatewayException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { DataSource } from 'typeorm';
import { PagamentosGatewayService } from './pagamentos-gateway.service';
import { CheckoutsService } from './checkouts.service';
import { ContasGatewayService } from '../contas-gateway/contas-gateway.service';
import { GatewayHttpService } from '../contas-gateway/gateway-http.service';
import {
  LinkCheckout,
  MetodoPagamento,
  EstadoLinkCheckout,
} from './entities/link-checkout.entity';
import { Pedido, EstadoPedido } from '../pedidos/entities/pedido.entity';
import {
  Transacao,
  EstadoTransacao,
} from '../transacoes/entities/transacao.entity';
import { lerTransacaoGateway } from '../comum/contrato-transacao-gateway';

describe('Execução financeira com reserva durável e gateway simulado', () => {
  const usuarioId = '7f2630eb-730f-48b8-98bb-b5b9945a4908';
  let link: LinkCheckout;
  let pedido: Pedido;
  let tentativa: Transacao | null;
  const gateway = { requisitar: jest.fn() };
  const contas = { obterToken: jest.fn() };
  const taxas = { consultarTaxas: jest.fn() };
  const gerenciador = {
    findOne: jest.fn(),
    findOneBy: jest.fn(),
    create: jest.fn((_tipo: unknown, dados: unknown) => dados),
    save: jest.fn(),
  };
  const fonte = {
    getRepository: jest.fn((tipo: unknown) => ({
      findOneBy: (condicao: { usuarioId?: string }) =>
        gerenciador.findOneBy(tipo, condicao),
    })),
    transaction: jest.fn(
      async (acao: (executor: typeof gerenciador) => unknown) =>
        acao(gerenciador),
    ),
  };
  const servico = new PagamentosGatewayService(
    fonte as unknown as DataSource,
    contas as unknown as ContasGatewayService,
    gateway as unknown as GatewayHttpService,
    taxas as unknown as CheckoutsService,
  );
  const resposta = () => ({
    id: 'pagamento-externo',
    type: link.metodo === MetodoPagamento.PIX ? 'PIX' : 'CREDIT_CARD',
    status: 'APPROVED',
    amount: 100,
    createdAt: '2026-10-10T12:00:00.000Z',
    metadata: {
      externalReference: 'PEDIDO-local',
      emv: 'emv-simulado',
      qrCodeBase64: 'aW1hZ2Vt',
      ChaveLoja: 'NAO-EXPOR',
      payerDocument: 'NAO-EXPOR',
      feeAmountCents: 2,
      netAmountCents: 98,
      cardBrand: 'VISA',
      installments: 1,
      feePercent: 2,
    },
  });
  beforeEach(() => {
    jest.clearAllMocks();
    link = {
      id: 'link-local',
      identificadorPublico: 'publico',
      usuarioId,
      valorCentavos: 100,
      metodo: MetodoPagamento.PIX,
      estado: EstadoLinkCheckout.ATIVO,
      expiraEm: new Date('2099-01-01'),
    } as LinkCheckout;
    pedido = {
      id: 'pedido-local',
      linkCheckoutId: link.id,
      referenciaExterna: 'PEDIDO-local',
      estado: EstadoPedido.PENDENTE,
      identificadorPagamentoGateway: null,
    } as Pedido;
    tentativa = null;
    gerenciador.findOne.mockImplementation(async (tipo: unknown) =>
      tipo === LinkCheckout ? link : pedido,
    );
    gerenciador.findOneBy.mockImplementation(
      async (tipo: unknown, condicao: { usuarioId?: string }) => {
        if (condicao.usuarioId && condicao.usuarioId !== usuarioId) return null;
        return tipo === LinkCheckout
          ? link
          : tipo === Pedido
            ? pedido
            : tentativa;
      },
    );
    gerenciador.save.mockImplementation(
      async (tipo: unknown, dados: Transacao) => {
        if (tipo === Transacao) tentativa = dados;
        return dados;
      },
    );
    contas.obterToken.mockResolvedValue('token-exclusivo-mock');
    gateway.requisitar.mockImplementation(async () => resposta());
    taxas.consultarTaxas.mockResolvedValue({
      total: 1,
      taxas: [{ bandeira: 'VISA', parcelas: 1, taxaPercentual: 2 }],
    });
  });

  it('reserva antes do POST e retorna somente dados públicos do Pix', async () => {
    gateway.requisitar.mockImplementationOnce(async () => {
      expect(tentativa?.estado).toBe(EstadoTransacao.PENDENTE);
      return resposta();
    });
    const retorno = await servico.pagarPix('publico', {
      documentoPagador: '12345678901',
    });
    expect(gateway.requisitar).toHaveBeenCalledWith('POST', '/payments/pix', {
      token: 'token-exclusivo-mock',
      corpo: {
        amount: 100,
        externalReference: 'PEDIDO-local',
        payerDocument: '12345678901',
      },
    });
    expect(retorno).toEqual({
      identificadorPagamento: 'pagamento-externo',
      estado: 'APPROVED',
      valorCentavos: 100,
      emv: 'emv-simulado',
      qrCodeBase64: 'aW1hZ2Vt',
    });
    expect(pedido.identificadorPagamentoGateway).toBe('pagamento-externo');
    expect(link.estado).toBe(EstadoLinkCheckout.PAGO);
  });

  it('não repete cobrança após timeout ou resposta inválida', async () => {
    gateway.requisitar.mockRejectedValueOnce(
      new BadGatewayException('Timeout simulado.'),
    );
    await expect(
      servico.pagarPix('publico', { documentoPagador: '12345678901' }),
    ).rejects.toThrow();
    expect(tentativa?.identificadorGateway).toBeNull();
    await expect(
      servico.pagarPix('publico', { documentoPagador: '12345678901' }),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(gateway.requisitar).toHaveBeenCalledTimes(1);
  });

  it('rejeita valor externo divergente sem confirmar o pedido', async () => {
    gateway.requisitar.mockResolvedValueOnce({ ...resposta(), amount: 200 });
    await expect(
      servico.pagarPix('publico', { documentoPagador: '12345678901' }),
    ).rejects.toBeInstanceOf(BadGatewayException);
    expect(pedido.estado).toBe(EstadoPedido.PENDENTE);
  });

  it('rejeita referência externa divergente', async () => {
    gateway.requisitar.mockResolvedValueOnce({
      ...resposta(),
      metadata: { externalReference: 'OUTRO' },
    });
    await expect(
      servico.pagarPix('publico', { documentoPagador: '12345678901' }),
    ).rejects.toBeInstanceOf(BadGatewayException);
  });

  it('usa taxa consultada e não persiste número do cartão ou CVV', async () => {
    link.metodo = MetodoPagamento.CARTAO;
    await servico.pagarCartao('publico', {
      bandeira: 'VISA',
      parcelas: 1,
      numeroCartao: '4111111111111111',
      titularCartao: 'TESTE',
      mesValidade: '12',
      anoValidade: '2030',
      codigoSeguranca: '123',
    });
    expect(taxas.consultarTaxas).toHaveBeenCalledWith('VISA');
    expect(gateway.requisitar).toHaveBeenCalledWith(
      'POST',
      '/payments/card',
      expect.objectContaining({
        corpo: expect.objectContaining({
          amount: 100,
          feePercent: 2,
          installments: 1,
          externalReference: 'PEDIDO-local',
        }),
      }),
    );
    expect(link.taxaAplicadaPercentual).toBe('2.0000');
    const persistido = JSON.stringify(gerenciador.save.mock.calls);
    expect(persistido).not.toContain('4111111111111111');
    expect(persistido).not.toContain('codigoSeguranca');
  });

  it('conciliação recusa checkout de outro lojista antes de chamar gateway', async () => {
    await expect(servico.conciliar('outro', 'publico')).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(gateway.requisitar).not.toHaveBeenCalled();
  });

  it('recupera tentativa incerta pela referência no extrato da própria conta', async () => {
    gateway.requisitar.mockRejectedValueOnce(new Error('Falha simulada'));
    await expect(
      servico.pagarPix('publico', { documentoPagador: '12345678901' }),
    ).rejects.toThrow();
    gateway.requisitar.mockResolvedValueOnce({ transactions: [resposta()] });
    await servico.conciliar(usuarioId, 'publico');
    expect(pedido.estado).toBe(EstadoPedido.APROVADO);
    expect(gateway.requisitar).toHaveBeenLastCalledWith(
      'GET',
      '/wallet/transactions',
      { token: 'token-exclusivo-mock' },
    );
  });

  it('consulta externa valida a referência mesmo quando já tem ID', async () => {
    await servico.pagarPix('publico', { documentoPagador: '12345678901' });
    gateway.requisitar.mockResolvedValueOnce(resposta());
    await servico.conciliar(usuarioId, 'publico');
    expect(gateway.requisitar).toHaveBeenLastCalledWith(
      'GET',
      '/payments/pagamento-externo',
      { token: 'token-exclusivo-mock' },
    );
  });

  it('parser descarta todos os metadados sensíveis', () => {
    const seguro = lerTransacaoGateway(resposta());
    expect(JSON.stringify(seguro)).not.toContain('NAO-EXPOR');
    expect(seguro.externalReference).toBe('PEDIDO-local');
  });

  it.each([NaN, 1.2, -1])('parser rejeita valor inválido %s', (amount) => {
    expect(() => lerTransacaoGateway({ ...resposta(), amount })).toThrow(
      BadGatewayException,
    );
  });
});
