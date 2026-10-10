import {
  BadGatewayException,
  BadRequestException,
  NotFoundException,
  ValidationPipe,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { DataSource, type EntityManager, Repository } from 'typeorm';
import { CHAVE_ROTA_PUBLICA } from '../autenticacao/decoradores/rota-publica.decorator';
import type { RequisicaoAutenticada } from '../autenticacao/guards/autenticacao.guard';
import { ContasGatewayService } from '../contas-gateway/contas-gateway.service';
import { GatewayHttpService } from '../contas-gateway/gateway-http.service';
import { EstadoPedido, Pedido } from '../pedidos/entities/pedido.entity';
import { CheckoutPublicoController } from './checkout-publico.controller';
import { CheckoutsController } from './checkouts.controller';
import { CheckoutsService } from './checkouts.service';
import { PagamentosGatewayService } from './pagamentos-gateway.service';
import {
  ConsultaTaxasDto,
  CriarCheckoutDto,
  PagarCartaoDto,
  PagarPixDto,
} from './dtos/checkout.dto';
import {
  EstadoLinkCheckout,
  LinkCheckout,
  MetodoPagamento,
} from './entities/link-checkout.entity';

describe('Checkouts e contratos confirmados de pagamentos', () => {
  const usuarioId = randomUUID();
  const identificador = randomUUID();
  const entrada = {
    valorCentavos: 15000,
    metodo: MetodoPagamento.PIX,
    expiraEm: '2099-12-31T23:59:59.000Z',
  };
  const link: LinkCheckout = {
    id: randomUUID(),
    identificadorPublico: identificador,
    usuarioId,
    valorCentavos: entrada.valorCentavos,
    metodo: MetodoPagamento.PIX,
    parcelas: null,
    bandeira: null,
    taxaAplicadaPercentual: null,
    estado: EstadoLinkCheckout.ATIVO,
    expiraEm: new Date(entrada.expiraEm),
  } as LinkCheckout;

  const links = { find: jest.fn(), findOneBy: jest.fn() };
  const gerenciador = {
    create: jest.fn((_entidade: unknown, dados: unknown) => dados),
    save: jest.fn((_entidade: unknown, dados: unknown) =>
      Promise.resolve(dados),
    ),
  };
  const fonte = {
    transaction: jest.fn(
      (executar: (gerenciador: EntityManager) => Promise<unknown>) =>
        executar(gerenciador as unknown as EntityManager),
    ),
  };
  const contas = { obterToken: jest.fn() };
  const gateway = { requisitar: jest.fn() };
  const servico = new CheckoutsService(
    links as unknown as Repository<LinkCheckout>,
    fonte as unknown as DataSource,
    contas as unknown as ContasGatewayService,
    gateway as unknown as GatewayHttpService,
  );
  const pipe = new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
  });

  beforeEach(() => {
    jest.clearAllMocks();
    links.find.mockReset().mockResolvedValue([link]);
    links.findOneBy.mockReset().mockResolvedValue(link);
    gerenciador.save
      .mockReset()
      .mockImplementation((_entidade: unknown, dados: unknown) =>
        Promise.resolve(dados),
      );
    contas.obterToken.mockReset().mockResolvedValue('token-ficticio');
    gateway.requisitar.mockReset().mockResolvedValue({
      total: 1,
      fees: [
        {
          id: randomUUID(),
          brand: 'VISA',
          installments: 3,
          feePercent: 3.19,
          feePercentFormatted: '3,19%',
        },
      ],
    });
  });

  it('consulta taxas públicas com o filtro externo confirmado e preserva o percentual', async () => {
    expect(await servico.consultarTaxas('VISA')).toEqual({
      total: 1,
      taxas: [{ bandeira: 'VISA', parcelas: 3, taxaPercentual: 3.19 }],
    });
    expect(gateway.requisitar).toHaveBeenCalledWith('GET', '/fees?brand=VISA');
    expect(contas.obterToken).not.toHaveBeenCalled();
  });

  it.each([
    null,
    { total: 1, fees: [] },
    { total: 1, fees: [{ brand: 'VISA', installments: 22, feePercent: 3.19 }] },
    {
      total: 1,
      fees: [{ brand: 'VISA', installments: 3, feePercent: '3.19' }],
    },
    { total: 1, fees: [{ brand: 'ELO', installments: 3, feePercent: 3.19 }] },
  ])(
    'rejeita tabela incompatível sem usar taxa presumida: %j',
    async (retorno) => {
      gateway.requisitar.mockResolvedValueOnce(retorno);
      await expect(servico.consultarTaxas('VISA')).rejects.toBeInstanceOf(
        BadGatewayException,
      );
    },
  );

  it('cria link e pedido na mesma transação com referência gerada pelo backend', async () => {
    const resultado = await servico.criar(usuarioId, entrada);
    expect(contas.obterToken).toHaveBeenCalledWith(usuarioId);
    expect(fonte.transaction).toHaveBeenCalledTimes(1);
    const [tipoLink, novoLink] = gerenciador.save.mock.calls[0] as [
      unknown,
      LinkCheckout,
    ];
    const [tipoPedido, novoPedido] = gerenciador.save.mock.calls[1] as [
      unknown,
      Pedido,
    ];
    expect(tipoLink).toBe(LinkCheckout);
    expect(tipoPedido).toBe(Pedido);
    expect(novoLink).toMatchObject({
      usuarioId,
      valorCentavos: 15000,
      metodo: 'PIX',
      taxaAplicadaPercentual: null,
    });
    expect(novoPedido).toMatchObject({
      linkCheckoutId: novoLink.id,
      estado: EstadoPedido.PENDENTE,
      identificadorPagamentoGateway: null,
    });
    expect(novoPedido.referenciaExterna).toMatch(/^PEDIDO-[0-9a-f-]{36}$/);
    expect(novoLink.identificadorPublico).not.toBe(novoLink.id);
    expect(resultado.identificadorPublico).toBe(novoLink.identificadorPublico);
    expect(resultado).not.toHaveProperty('usuarioId');
    expect(resultado).not.toHaveProperty('referenciaExterna');
    expect(gateway.requisitar).not.toHaveBeenCalled();
  });

  it('não inicia persistência se o lojista não possui acesso válido ao gateway', async () => {
    contas.obterToken.mockRejectedValueOnce(
      new BadRequestException('Vínculo necessário.'),
    );
    await expect(servico.criar(usuarioId, entrada)).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(fonte.transaction).not.toHaveBeenCalled();
  });

  it('não apresenta link quando a persistência do pedido falha', async () => {
    gerenciador.save
      .mockResolvedValueOnce(link)
      .mockRejectedValueOnce(new Error('Falha de persistência simulada.'));
    await expect(servico.criar(usuarioId, entrada)).rejects.toThrow(
      'Falha de persistência simulada.',
    );
    expect(gateway.requisitar).not.toHaveBeenCalled();
  });

  it('rejeita link já expirado antes de consultar a conta ou persistir', async () => {
    await expect(
      servico.criar(usuarioId, {
        ...entrada,
        expiraEm: '2000-01-01T00:00:00.000Z',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(contas.obterToken).not.toHaveBeenCalled();
    expect(fonte.transaction).not.toHaveBeenCalled();
  });

  it('lista somente os links do proprietário definido pelo JWT', async () => {
    const requisicao = {
      usuarioAutenticado: { id: usuarioId },
      body: { usuarioId: randomUUID() },
    } as unknown as RequisicaoAutenticada;
    await new CheckoutsController(
      servico,
      {} as PagamentosGatewayService,
    ).listar(requisicao);
    expect(links.find).toHaveBeenCalledWith({
      where: { usuarioId },
      order: { criadoEm: 'DESC' },
    });
  });

  it('consulta pública utiliza somente o identificador público e não expõe o proprietário', async () => {
    const resultado = await new CheckoutPublicoController(
      servico,
      {} as PagamentosGatewayService,
    ).consultar(identificador);
    expect(links.findOneBy).toHaveBeenCalledWith({
      identificadorPublico: identificador,
    });
    expect(resultado).not.toHaveProperty('id');
    expect(resultado).not.toHaveProperty('usuarioId');
    expect(resultado).not.toHaveProperty('token');
    expect(
      Reflect.getMetadata(CHAVE_ROTA_PUBLICA, CheckoutPublicoController),
    ).toBe(true);
    expect(
      Reflect.getMetadata(CHAVE_ROTA_PUBLICA, CheckoutsController),
    ).toBeUndefined();
  });

  it('consulta pública de cartão apresenta as parcelas e taxas consultadas no gateway', async () => {
    links.findOneBy.mockResolvedValueOnce({
      ...link,
      metodo: MetodoPagamento.CARTAO,
    });
    expect((await servico.consultarPublico(identificador)).taxas).toEqual([
      { bandeira: 'VISA', parcelas: 3, taxaPercentual: 3.19 },
    ]);
    expect(gateway.requisitar).toHaveBeenCalledWith('GET', '/fees');
  });

  it('apresenta expiração sem escrever no banco ou consultar taxas', async () => {
    links.findOneBy.mockResolvedValueOnce({
      ...link,
      metodo: MetodoPagamento.CARTAO,
      expiraEm: new Date(0),
    });
    expect((await servico.consultarPublico(identificador)).estado).toBe(
      EstadoLinkCheckout.EXPIRADO,
    );
    expect(fonte.transaction).not.toHaveBeenCalled();
    expect(gateway.requisitar).not.toHaveBeenCalled();
  });

  it('não resolve checkout inexistente por outro identificador', async () => {
    links.findOneBy.mockResolvedValueOnce(null);
    await expect(servico.consultarPublico(randomUUID())).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it.each([0, 1.5, 4294967296])(
    'rejeita valor fora do inteiro em centavos: %s',
    async (valorCentavos) => {
      await expect(
        pipe.transform(
          { ...entrada, valorCentavos },
          { type: 'body', metatype: CriarCheckoutDto },
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
    },
  );

  it('valida entradas confirmadas de Pix/cartão sem executar chamadas externas', async () => {
    expect(
      await pipe.transform(
        { documentoPagador: '11111111111' },
        { type: 'body', metatype: PagarPixDto },
      ),
    ).toBeInstanceOf(PagarPixDto);
    const cartao = {
      bandeira: 'VISA',
      parcelas: 3,
      numeroCartao: '4111111111111111',
      titularCartao: 'TESTE',
      mesValidade: '12',
      anoValidade: '2030',
      codigoSeguranca: '123',
    };
    expect(
      await pipe.transform(cartao, { type: 'body', metatype: PagarCartaoDto }),
    ).toBeInstanceOf(PagarCartaoDto);
    for (const campo of [
      { valorCentavos: 1 },
      { feePercent: 0 },
      { externalReference: 'CLIENTE' },
      { usuarioId },
    ]) {
      await expect(
        pipe.transform(
          { ...cartao, ...campo },
          { type: 'body', metatype: PagarCartaoDto },
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
    }
    await expect(
      pipe.transform(
        { ...cartao, parcelas: 22 },
        { type: 'body', metatype: PagarCartaoDto },
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(gateway.requisitar).not.toHaveBeenCalled();
    expect(gerenciador.save).not.toHaveBeenCalled();
  });

  it('rejeita bandeira desconhecida e identidade enviada na criação', async () => {
    await expect(
      pipe.transform(
        { bandeira: 'OUTRA' },
        { type: 'query', metatype: ConsultaTaxasDto },
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      pipe.transform(
        { ...entrada, usuarioId },
        { type: 'body', metatype: CriarCheckoutDto },
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
