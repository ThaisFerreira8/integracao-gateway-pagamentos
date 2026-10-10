import { BadGatewayException, GatewayTimeoutException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GatewayHttpService } from './gateway-http.service';

const criarServico = (
  base = 'https://api.branchpay.com.br',
  timeout = '10000',
) => {
  const valores: Record<string, string> = {
    GATEWAY_BASE_URL: base,
    GATEWAY_TIMEOUT_MS: timeout,
  };
  const servico = new GatewayHttpService({
    get: (nome: string, padrao?: string) => valores[nome] ?? padrao,
  } as ConfigService);
  servico.onModuleInit();
  return servico;
};

describe('Cliente HTTP do gateway', () => {
  let consultar: jest.SpiedFunction<typeof fetch>;

  beforeEach(() => {
    // Todas as chamadas são simuladas; nenhum acesso ao sandbox é realizado.
    consultar = jest.spyOn(globalThis, 'fetch');
  });

  afterEach(() => {
    jest.restoreAllMocks();
    jest.useRealTimers();
  });

  it.each([
    'https://api.branchpay.com.br',
    'https://api.branchpay.com.br/api',
    'https://api.branchpay.com.br/api/',
  ])('normaliza a base e preserva filtros (%s)', async (base) => {
    consultar.mockResolvedValue(
      new Response(JSON.stringify({ total: 0, fees: [] }), { status: 200 }),
    );
    expect(
      await criarServico(base).requisitar('GET', '/fees?brand=VISA'),
    ).toEqual({ total: 0, fees: [] });
    const [endereco, opcoes] = consultar.mock.calls[0];
    expect(String(endereco)).toBe(
      'https://api.branchpay.com.br/api/fees?brand=VISA',
    );
    expect(opcoes?.headers).toEqual({ Accept: 'application/json' });
    expect(opcoes?.body).toBeUndefined();
    expect(opcoes?.redirect).toBe('error');
  });

  it('envia body JSON e Bearer apenas quando fornecidos', async () => {
    consultar.mockResolvedValue(
      new Response(JSON.stringify({ id: 'operacao-ficticia' }), {
        status: 201,
      }),
    );
    const retorno = await criarServico().requisitar('POST', '/operacao-teste', {
      token: 'token-ficticio',
      corpo: { amount: 100 },
    });
    expect(retorno).toEqual({ id: 'operacao-ficticia' });
    expect(consultar.mock.calls[0][1]).toEqual(
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ amount: 100 }),
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
          Authorization: 'Bearer token-ficticio',
        },
      }),
    );
  });

  it('aceita DELETE sem conteúdo', async () => {
    consultar.mockResolvedValue(new Response(null, { status: 204 }));
    expect(
      await criarServico().requisitar('DELETE', '/webhooks/id-ficticio', {
        token: 'token-ficticio',
      }),
    ).toBeNull();
  });

  it.each([400, 401, 403, 429, 500])(
    'preserva somente status de erro e não repassa payload sensível (%i)',
    async (status) => {
      consultar.mockResolvedValue(
        new Response(
          JSON.stringify({ message: 'senha-ficticia token-ficticio' }),
          { status },
        ),
      );
      try {
        await criarServico().requisitar('GET', '/wallet');
        throw new Error('A requisição deveria falhar.');
      } catch (erro) {
        expect(erro).toBeInstanceOf(BadGatewayException);
        const resposta = (erro as BadGatewayException).getResponse();
        expect(resposta).toEqual({
          message: 'O gateway recusou a requisição.',
          statusGateway: status,
        });
        expect(JSON.stringify(resposta)).not.toContain('senha-ficticia');
      }
      expect(consultar).toHaveBeenCalledTimes(1);
    },
  );

  it('oculta detalhes de falhas de transporte', async () => {
    consultar.mockRejectedValue(
      new Error('credencial-ficticia em detalhe de transporte'),
    );
    await expect(criarServico().requisitar('GET', '/wallet')).rejects.toThrow(
      'Não foi possível obter uma resposta válida do gateway.',
    );
    expect(consultar).toHaveBeenCalledTimes(1);
  });

  it('rejeita resposta JSON inválida sem expor o conteúdo', async () => {
    consultar.mockResolvedValue(
      new Response('conteudo-sensivel-ficticio', { status: 200 }),
    );
    await expect(criarServico().requisitar('GET', '/wallet')).rejects.toThrow(
      'Não foi possível obter uma resposta válida do gateway.',
    );
  });

  it('cancela por timeout e não repete a operação', async () => {
    jest.useFakeTimers();
    consultar.mockImplementation(
      (_endereco, opcoes) =>
        new Promise((_resolver, rejeitar) => {
          opcoes?.signal?.addEventListener(
            'abort',
            () => rejeitar(new Error('cancelado')),
            { once: true },
          );
        }),
    );
    const promessa = criarServico(undefined, '20').requisitar(
      'POST',
      '/operacao-teste',
      { corpo: { amount: 100 } },
    );
    const verificacao = expect(promessa).rejects.toBeInstanceOf(
      GatewayTimeoutException,
    );
    await jest.advanceTimersByTimeAsync(20);
    await verificacao;
    expect(consultar).toHaveBeenCalledTimes(1);
    expect(consultar.mock.calls[0][1]?.signal?.aborted).toBe(true);
    expect(jest.getTimerCount()).toBe(0);
  });

  it('mantém o timeout durante a leitura da resposta', async () => {
    jest.useFakeTimers();
    consultar.mockImplementation(
      async (_endereco, opcoes) =>
        ({
          ok: true,
          status: 200,
          text: () =>
            new Promise((_resolver, rejeitar) => {
              opcoes?.signal?.addEventListener(
                'abort',
                () => rejeitar(new Error('cancelado')),
                { once: true },
              );
            }),
        }) as Response,
    );
    const verificacao = expect(
      criarServico(undefined, '20').requisitar('GET', '/wallet'),
    ).rejects.toBeInstanceOf(GatewayTimeoutException);
    await jest.advanceTimersByTimeAsync(20);
    await verificacao;
    expect(jest.getTimerCount()).toBe(0);
  });

  it.each([
    'http://api.branchpay.com.br',
    'https://usuario:senha@example.com',
    'https://example.com/fora',
    'https://example.com?token=ficticio',
    'invalido',
    '',
  ])('rejeita configuração de base insegura na inicialização (%s)', (base) => {
    expect(() => criarServico(base)).toThrow('GATEWAY_BASE_URL');
    expect(consultar).not.toHaveBeenCalled();
  });

  it.each(['0', '-1', '1.5', 'invalido', '2147483648'])(
    'rejeita timeout inválido (%s)',
    (timeout) => {
      expect(() => criarServico(undefined, timeout)).toThrow(
        'GATEWAY_TIMEOUT_MS',
      );
    },
  );

  it.each([
    'https://outro-host.example',
    '//outro-host.example',
    '/../fora',
    '/%2e%2e/fora',
    '/wallet#fragmento',
    '/\\outro-host.example',
  ])(
    'rejeita caminho que saia da API ou altere destino (%s)',
    async (caminho) => {
      await expect(
        criarServico().requisitar('GET', caminho),
      ).rejects.toBeInstanceOf(BadGatewayException);
      expect(consultar).not.toHaveBeenCalled();
    },
  );

  it('rejeita body em GET e token malformado antes da chamada', async () => {
    await expect(
      criarServico().requisitar('GET', '/wallet', { corpo: {} }),
    ).rejects.toBeInstanceOf(BadGatewayException);
    await expect(
      criarServico().requisitar('GET', '/wallet', {
        token: 'token com espaços',
      }),
    ).rejects.toBeInstanceOf(BadGatewayException);
    expect(consultar).not.toHaveBeenCalled();
  });
});
