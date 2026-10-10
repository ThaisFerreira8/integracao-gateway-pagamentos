import {
  BadGatewayException,
  BadRequestException,
  ConflictException,
  ValidationPipe,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomBytes, randomUUID } from 'node:crypto';
import { QueryFailedError, Repository } from 'typeorm';
import type { RequisicaoAutenticada } from '../autenticacao/guards/autenticacao.guard';
import { ContasGatewayController } from './contas-gateway.controller';
import { ContasGatewayService } from './contas-gateway.service';
import { CriptografiaService } from './criptografia.service';
import {
  CadastrarContaGatewayDto,
  VincularContaGatewayDto,
} from './dtos/cadastrar-conta-gateway.dto';
import { ContaGateway } from './entities/conta-gateway.entity';
import { GatewayHttpService } from './gateway-http.service';
import type {
  PerfilGateway,
  RetornoLoginGateway,
} from './tipos/contrato-gateway';

describe('Cadastro e vínculo de contas do gateway', () => {
  const usuarioId = randomUUID();
  const identificadorGateway = randomUUID();
  const documento = '11111111111';
  const entradaVinculo = { documento, senha: 'senha-ficticia' };
  const cadastro = {
    tipoPessoa: 'PF' as const,
    nome: 'Lojista de teste',
    email: 'lojista@example.com',
    telefone: '11999999999',
    documento,
    cep: '01310100',
    endereco: 'Rua de teste',
    numero: '10',
    bairro: 'Centro',
    cidade: 'São Paulo',
    estado: 'SP',
  };
  const contas = {
    findOneBy: jest.fn(),
    findOne: jest.fn(),
    create: jest.fn((dados) => Object.assign(new ContaGateway(), dados)),
    save: jest.fn(),
  };
  const gateway = { requisitar: jest.fn() };
  let criptografia: CriptografiaService;
  let servico: ContasGatewayService;
  let token: string;
  let acesso: RetornoLoginGateway;
  let perfil: Pick<
    PerfilGateway,
    'id' | 'document' | 'codigoCliente' | 'chaveLoja'
  >;

  beforeEach(() => {
    jest.clearAllMocks();
    contas.findOneBy.mockReset().mockResolvedValue(null);
    contas.findOne.mockReset().mockResolvedValue(null);
    contas.save.mockReset().mockImplementation(async (conta) => ({
      ...conta,
      id: 'vinculo-ficticio',
    }));
    gateway.requisitar.mockReset();
    const chave = randomBytes(32).toString('hex');
    criptografia = new CriptografiaService({
      get: (nome: string) =>
        nome === 'GATEWAY_ENCRYPTION_KEY' ? chave : undefined,
    } as ConfigService);
    servico = new ContasGatewayService(
      contas as unknown as Repository<ContaGateway>,
      gateway as unknown as GatewayHttpService,
      criptografia,
    );
    token = `cabecalho.${Buffer.from(JSON.stringify({ exp: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url')}.assinatura-ficticia`;
    acesso = {
      access_token: token,
      token_type: 'Bearer',
      codigoCliente: 123,
      chaveLoja: 'chave-ficticia',
      user: {
        id: identificadorGateway,
        document: documento,
        personType: 'PF',
        name: 'Lojista de teste',
        tradingName: null,
        email: 'lojista@example.com',
      },
    };
    perfil = {
      id: identificadorGateway,
      document: documento,
      codigoCliente: 123,
      chaveLoja: 'chave-ficticia',
    };
    gateway.requisitar
      .mockResolvedValueOnce(acesso)
      .mockResolvedValueOnce(perfil);
  });

  it('confirma identidade, cifra credenciais e retorna somente dados seguros do vínculo', async () => {
    const resultado = await servico.vincular(usuarioId, entradaVinculo);
    expect(gateway.requisitar).toHaveBeenNthCalledWith(
      1,
      'POST',
      '/auth/login',
      { corpo: { document: documento, password: entradaVinculo.senha } },
    );
    expect(gateway.requisitar).toHaveBeenNthCalledWith(2, 'GET', '/users/me', {
      token,
    });
    const gravada = contas.save.mock.calls[0][0];
    expect(gravada.usuarioId).toBe(usuarioId);
    expect(criptografia.descriptografar(gravada.tokenCriptografado)).toBe(
      token,
    );
    expect(criptografia.descriptografar(gravada.chaveLojaCriptografada)).toBe(
      'chave-ficticia',
    );
    expect(JSON.stringify(gravada)).not.toContain(entradaVinculo.senha);
    expect(gravada.tokenCriptografado).not.toBe(token);
    expect(gravada.tokenExpiraEm).toBeInstanceOf(Date);
    expect(Object.keys(resultado).sort()).toEqual([
      'id',
      'tokenExpiraEm',
      'vinculada',
    ]);
  });

  it('impede associação da mesma conta a outro lojista', async () => {
    contas.findOneBy
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ usuarioId: randomUUID() });
    await expect(
      servico.vincular(usuarioId, entradaVinculo),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(contas.save).not.toHaveBeenCalled();
  });

  it('permite renovar somente a mesma conta vinculada', async () => {
    contas.findOneBy.mockResolvedValueOnce({
      id: 'vinculo-ficticio',
      usuarioId,
      documento,
      identificadorGateway,
    });
    await servico.vincular(usuarioId, entradaVinculo);
    expect(contas.create.mock.calls[0][0].id).toBe('vinculo-ficticio');
    contas.findOneBy.mockResolvedValueOnce({ documento: '22222222222' });
    gateway.requisitar.mockClear();
    await expect(
      servico.vincular(usuarioId, entradaVinculo),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(gateway.requisitar).not.toHaveBeenCalled();
  });

  it('rejeita divergência entre login e perfil antes de persistir', async () => {
    gateway.requisitar
      .mockReset()
      .mockResolvedValueOnce(acesso)
      .mockResolvedValueOnce({ ...perfil, id: randomUUID() });
    await expect(
      servico.vincular(usuarioId, entradaVinculo),
    ).rejects.toBeInstanceOf(BadGatewayException);
    expect(contas.save).not.toHaveBeenCalled();
  });

  it.each([null, {}, { access_token: 'token com espaços' }])(
    'rejeita resposta de login incompleta (%j)',
    async (resposta) => {
      gateway.requisitar.mockReset().mockResolvedValue(resposta);
      await expect(
        servico.vincular(usuarioId, entradaVinculo),
      ).rejects.toBeInstanceOf(BadGatewayException);
      expect(contas.save).not.toHaveBeenCalled();
    },
  );

  it('trata conflito de unicidade sem expor parâmetros do banco', async () => {
    contas.save.mockRejectedValue(
      new QueryFailedError(
        'INSERT ficticio',
        ['credencial-ficticia'],
        Object.assign(new Error('duplicado'), { code: 'ER_DUP_ENTRY' }),
      ),
    );
    await expect(
      servico.vincular(usuarioId, entradaVinculo),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('não persiste nada após falha do gateway', async () => {
    gateway.requisitar
      .mockReset()
      .mockRejectedValue(new BadGatewayException('Falha simulada.'));
    await expect(
      servico.vincular(usuarioId, entradaVinculo),
    ).rejects.toBeInstanceOf(BadGatewayException);
    expect(contas.save).not.toHaveBeenCalled();
  });

  it('consulta apenas o vínculo do lojista e não serializa credenciais', async () => {
    contas.findOneBy.mockResolvedValue({
      id: 'vinculo-ficticio',
      usuarioId,
      tokenCriptografado: 'oculto',
      codigoCliente: 123,
      tokenExpiraEm: null,
    });
    expect(await servico.consultar(usuarioId)).toEqual({
      id: 'vinculo-ficticio',
      vinculada: true,
      tokenExpiraEm: null,
    });
    expect(contas.findOneBy).toHaveBeenCalledWith({ usuarioId });
  });

  it('recupera token somente do proprietário para consumo interno', async () => {
    contas.findOne.mockResolvedValue({
      tokenCriptografado: criptografia.criptografar(token),
      tokenExpiraEm: null,
    });
    expect(await servico.obterToken(usuarioId)).toBe(token);
    expect(contas.findOne).toHaveBeenCalledWith({
      where: { usuarioId },
      select: { id: true, tokenCriptografado: true, tokenExpiraEm: true },
    });
  });

  it.each([
    null,
    { tokenCriptografado: 'cifrado', tokenExpiraEm: new Date(0) },
  ])('exige renovação para token ausente ou expirado', async (conta) => {
    contas.findOne.mockResolvedValue(conta);
    await expect(servico.obterToken(usuarioId)).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('mapeia cadastro confirmado no OpenAPI sem assumir a resposta externa', async () => {
    gateway.requisitar
      .mockReset()
      .mockResolvedValue({ campoNaoDocumentado: 'credencial-ficticia' });
    const resultado = await servico.cadastrar(usuarioId, cadastro);
    const enviado = gateway.requisitar.mock.calls[0];
    expect(enviado[0]).toBe('POST');
    expect(enviado[1]).toBe('/users');
    expect(enviado[2].corpo).toEqual({
      personType: 'PF',
      name: cadastro.nome,
      tradingName: undefined,
      email: cadastro.email,
      phone: cadastro.telefone,
      document: documento,
      zipCode: cadastro.cep,
      address: cadastro.endereco,
      number: cadastro.numero,
      complement: undefined,
      neighborhood: cadastro.bairro,
      city: cadastro.cidade,
      state: cadastro.estado,
    });
    expect(JSON.stringify(resultado)).not.toContain('credencial-ficticia');
    expect(contas.save).not.toHaveBeenCalled();
  });

  it('valida PF/PJ, endereço e rejeita campos extras', async () => {
    const pipe = new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    });
    const metadados = {
      type: 'body' as const,
      metatype: CadastrarContaGatewayDto,
    };
    expect(await pipe.transform(cadastro, metadados)).toBeInstanceOf(
      CadastrarContaGatewayDto,
    );
    await expect(
      pipe.transform({ ...cadastro, tipoPessoa: 'PJ' }, metadados),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      pipe.transform({ ...cadastro, usuarioId: 'outro' }, metadados),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      pipe.transform({ ...cadastro, telefone: '123' }, metadados),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      pipe.transform(
        { documento, senha: '' },
        { type: 'body', metatype: VincularContaGatewayDto },
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  const requisicaoLocal = (segura = false) =>
    ({
      secure: segura,
      hostname: 'localhost',
      socket: { remoteAddress: '127.0.0.1' },
      headers: {},
      usuarioAutenticado: { id: usuarioId },
    }) as unknown as RequisicaoAutenticada;

  const criarController = (ambiente?: string) =>
    new ContasGatewayController(
      servico,
      new ConfigService(ambiente ? { NODE_ENV: ambiente } : {}, {
        skipProcessEnv: true,
      }),
    );

  it.each([{}, { 'x-forwarded-proto': 'https' }])(
    'rejeita HTTP em produção, mesmo com cabeçalhos %j',
    (cabecalhos) => {
      const controller = criarController('production');
      const requisicao = requisicaoLocal();
      requisicao.headers = cabecalhos;
      expect(() => controller.vincular(requisicao, entradaVinculo)).toThrow(
        BadRequestException,
      );
      expect(gateway.requisitar).not.toHaveBeenCalled();
    },
  );

  it('aceita HTTPS em produção', async () => {
    await criarController('production').vincular(
      requisicaoLocal(true),
      entradaVinculo,
    );
    expect(contas.create.mock.calls[0][0].usuarioId).toBe(usuarioId);
  });

  it.each(['development', 'test', undefined])(
    'aceita localhost por HTTP no ambiente %s',
    async (ambiente) => {
      await criarController(ambiente).vincular(
        requisicaoLocal(),
        entradaVinculo,
      );
      expect(contas.create.mock.calls[0][0].usuarioId).toBe(usuarioId);
    },
  );

  it('rejeita HTTP remoto mesmo quando o cliente informa localhost', () => {
    const controller = criarController('development');
    const requisicao = {
      ...requisicaoLocal(),
      socket: { remoteAddress: '192.0.2.1' },
    } as unknown as RequisicaoAutenticada;
    expect(() => controller.vincular(requisicao, entradaVinculo)).toThrow(
      BadRequestException,
    );
    expect(gateway.requisitar).not.toHaveBeenCalled();
  });
});
