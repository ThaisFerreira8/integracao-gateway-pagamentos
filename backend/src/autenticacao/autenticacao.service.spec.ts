import {
  ValidationPipe,
  UnauthorizedException,
  type INestApplication,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { randomBytes, randomUUID } from 'node:crypto';
import { QueryFailedError } from 'typeorm';
import { CHAVE_ROTA_PUBLICA } from './decoradores/rota-publica.decorator';
import request from 'supertest';
import { Usuario } from '../usuarios/entities/usuario.entity';
import { AutenticacaoController } from './autenticacao.controller';
import { criarConfiguracaoJwt } from './autenticacao.module';
import { AutenticacaoService } from './autenticacao.service';

const configurarJwt = (valores: Record<string, string | undefined>) =>
  criarConfiguracaoJwt({
    get: (nome: string) => valores[nome],
  } as ConfigService);

describe('Autenticação de lojistas', () => {
  let aplicacao: INestApplication;
  let servico: AutenticacaoService;
  let jwt: JwtService;
  let usuario: Usuario;
  const consulta = {
    addSelect: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    getOne: jest.fn(),
  };
  const repositorio = {
    createQueryBuilder: jest.fn().mockReturnValue(consulta),
    findOneBy: jest.fn(),
    create: jest.fn((dados: Partial<Usuario>) =>
      Object.assign(new Usuario(), dados),
    ),
    save: jest.fn(),
  };

  beforeAll(async () => {
    jwt = new JwtService(
      configurarJwt({
        JWT_SECRET: randomBytes(32).toString('hex'),
        JWT_EXPIRES_IN_SECONDS: '3600',
      }),
    );
    const modulo = await Test.createTestingModule({
      controllers: [AutenticacaoController],
      providers: [
        AutenticacaoService,
        { provide: JwtService, useValue: jwt },
        { provide: getRepositoryToken(Usuario), useValue: repositorio },
      ],
    }).compile();
    servico = modulo.get(AutenticacaoService);
    aplicacao = modulo.createNestApplication();
    aplicacao.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await aplicacao.init();
    usuario = Object.assign(new Usuario(), {
      id: 'usuario-ficticio',
      nome: 'Lojista de teste',
      email: 'lojista@example.com',
      senhaHash: await servico.gerarHashSenha('senha-ficticia'),
    });
  });

  beforeEach(() => {
    jest.clearAllMocks();
    consulta.getOne.mockResolvedValue(usuario);
    repositorio.findOneBy.mockReset().mockResolvedValue(null);
    repositorio.save
      .mockReset()
      .mockImplementation(async (dados: Usuario) =>
        Object.assign(new Usuario(), dados, { id: randomUUID() }),
      );
  });

  afterAll(async () => {
    await aplicacao.close();
  });

  it('gera hashes distintos para a mesma senha sem armazenar o texto original', async () => {
    const primeiro = await servico.gerarHashSenha('senha-ficticia');
    const segundo = await servico.gerarHashSenha('senha-ficticia');
    expect(primeiro).not.toBe(segundo);
    expect(primeiro).toMatch(/^scrypt:[0-9a-f]{32}:[0-9a-f]{128}$/);
    expect(primeiro).not.toContain('senha-ficticia');
  });

  it('cadastro público normaliza dados, persiste hash e permite login sem criar conta no gateway', async () => {
    expect(
      Reflect.getMetadata(
        CHAVE_ROTA_PUBLICA,
        AutenticacaoController.prototype.cadastrar,
      ),
    ).toBe(true);
    const resposta = await request(aplicacao.getHttpServer())
      .post('/autenticacao/cadastro')
      .send({
        nome: '  Lojista Novo  ',
        email: '  NOVO@example.com  ',
        senha: 'senha-ficticia',
      })
      .expect(201);
    expect(Object.keys(resposta.body).sort()).toEqual(['email', 'id', 'nome']);
    expect(resposta.body).toMatchObject({
      nome: 'Lojista Novo',
      email: 'novo@example.com',
    });
    expect(repositorio.findOneBy).toHaveBeenCalledWith({
      email: 'novo@example.com',
    });
    const criado = repositorio.save.mock.calls[0][0] as Usuario;
    expect(criado.senhaHash).toMatch(/^scrypt:[0-9a-f]{32}:[0-9a-f]{128}$/);
    expect(JSON.stringify(resposta.body)).not.toContain('senha');
    consulta.getOne.mockResolvedValue({ ...criado, id: resposta.body.id });
    const login = await request(aplicacao.getHttpServer())
      .post('/autenticacao/login')
      .send({ email: 'novo@example.com', senha: 'senha-ficticia' })
      .expect(200);
    expect((await jwt.verifyAsync(login.body.tokenAcesso)).sub).toBe(
      resposta.body.id,
    );
  });

  it('rejeita e-mail já cadastrado antes de persistir', async () => {
    repositorio.findOneBy.mockResolvedValueOnce(usuario);
    await request(aplicacao.getHttpServer())
      .post('/autenticacao/cadastro')
      .send({
        nome: 'Novo Lojista',
        email: usuario.email,
        senha: 'senha-ficticia',
      })
      .expect(409);
    expect(repositorio.create).not.toHaveBeenCalled();
    expect(repositorio.save).not.toHaveBeenCalled();
  });

  it('trata duplicidade concorrente sem expor erro SQL ou hash', async () => {
    repositorio.save.mockRejectedValueOnce(
      new QueryFailedError(
        'SQL-NAO-EXIBIR',
        [],
        Object.assign(new Error('NAO-EXIBIR'), { code: 'ER_DUP_ENTRY' }),
      ),
    );
    const resposta = await request(aplicacao.getHttpServer())
      .post('/autenticacao/cadastro')
      .send({
        nome: 'Novo Lojista',
        email: 'novo@example.com',
        senha: 'senha-ficticia',
      })
      .expect(409);
    expect(resposta.body.message).toBe('Este e-mail já possui uma conta.');
    expect(JSON.stringify(resposta.body)).not.toContain('NAO-EXIBIR');
  });

  it('falha de persistência retorna mensagem segura', async () => {
    repositorio.save.mockRejectedValueOnce(new Error('senhaHash=NAO-EXIBIR'));
    const resposta = await request(aplicacao.getHttpServer())
      .post('/autenticacao/cadastro')
      .send({
        nome: 'Novo Lojista',
        email: 'novo@example.com',
        senha: 'senha-ficticia',
      })
      .expect(500);
    expect(resposta.body.message).toBe('Não foi possível criar sua conta.');
    expect(JSON.stringify(resposta.body)).not.toContain('NAO-EXIBIR');
  });

  it.each([
    { nome: ' ' },
    { email: 'inválido' },
    { senha: 'curta' },
    { senha: 'a'.repeat(129) },
    { usuarioId: 'outro' },
    { administrador: true },
  ])('rejeita entrada inválida no cadastro (%j)', async (alteracao) => {
    await request(aplicacao.getHttpServer())
      .post('/autenticacao/cadastro')
      .send({
        nome: 'Novo Lojista',
        email: 'novo@example.com',
        senha: 'senha-ficticia',
        ...alteracao,
      })
      .expect(400);
    expect(repositorio.findOneBy).not.toHaveBeenCalled();
    expect(repositorio.save).not.toHaveBeenCalled();
  });

  it('autentica por HTTP e emite token verificável com duração e usuário corretos', async () => {
    const resposta = await request(aplicacao.getHttpServer())
      .post('/autenticacao/login')
      .send({ email: '  LOJISTA@example.com  ', senha: 'senha-ficticia' })
      .expect(200);
    expect(consulta.addSelect).toHaveBeenCalledWith('usuario.senhaHash');
    expect(consulta.where).toHaveBeenCalledWith('usuario.email = :email', {
      email: usuario.email,
    });
    expect(Object.keys(resposta.body).sort()).toEqual([
      'tipoToken',
      'tokenAcesso',
      'usuario',
    ]);
    expect(resposta.body.usuario).toEqual({
      id: usuario.id,
      nome: usuario.nome,
      email: usuario.email,
    });
    expect(resposta.body.tipoToken).toBe('Bearer');
    const sessao = await jwt.verifyAsync(resposta.body.tokenAcesso);
    expect(sessao.sub).toBe(usuario.id);
    expect(sessao.exp - sessao.iat).toBe(3600);
    expect(sessao.iss).toBe('baas');
    expect(sessao.aud).toBe('lojista');
    expect(sessao.senhaHash).toBeUndefined();
    expect(JSON.stringify(resposta.body)).not.toContain(usuario.senhaHash);
  });

  it('retorna o mesmo erro para usuário ausente e senha incorreta', async () => {
    const assinatura = jest.spyOn(jwt, 'signAsync');
    const incorreta = await request(aplicacao.getHttpServer())
      .post('/autenticacao/login')
      .send({ email: usuario.email, senha: 'senha-incorreta' })
      .expect(401);
    consulta.getOne.mockResolvedValue(null);
    const ausente = await request(aplicacao.getHttpServer())
      .post('/autenticacao/login')
      .send({ email: usuario.email, senha: 'senha-incorreta' })
      .expect(401);
    expect(incorreta.body.message).toBe('E-mail ou senha inválidos.');
    expect(ausente.body.message).toBe(incorreta.body.message);
    expect(assinatura).not.toHaveBeenCalled();
    assinatura.mockRestore();
  });

  it('rejeita hash persistido malformado sem expor detalhes', async () => {
    consulta.getOne.mockResolvedValue({
      ...usuario,
      senhaHash: 'formato-invalido',
    });
    await expect(
      servico.entrar({ email: usuario.email, senha: 'senha-ficticia' }),
    ).rejects.toThrow(UnauthorizedException);
  });

  it.each([
    { email: 'email-invalido', senha: 'senha-ficticia' },
    { email: 'lojista@example.com', senha: '' },
    { email: 'lojista@example.com', senha: 123 },
    { email: 'lojista@example.com', senha: 'a'.repeat(129) },
    {
      email: 'lojista@example.com',
      senha: 'senha-ficticia',
      administrador: true,
    },
  ])(
    'rejeita entrada inválida antes de consultar usuários (%j)',
    async (entrada) => {
      await request(aplicacao.getHttpServer())
        .post('/autenticacao/login')
        .send(entrada)
        .expect(400);
      expect(repositorio.createQueryBuilder).not.toHaveBeenCalled();
    },
  );

  it.each([undefined, '', 'segredo-curto'])(
    'rejeita segredo JWT ausente ou curto',
    (segredo) => {
      expect(() =>
        configurarJwt({ JWT_SECRET: segredo, JWT_EXPIRES_IN_SECONDS: '3600' }),
      ).toThrow('JWT_SECRET');
    },
  );

  it.each([undefined, '', '0', '-1', '1.5', '1h', '9007199254740992'])(
    'rejeita duração JWT inválida (%s)',
    (duracao) => {
      expect(() =>
        configurarJwt({
          JWT_SECRET: 's'.repeat(32),
          JWT_EXPIRES_IN_SECONDS: duracao,
        }),
      ).toThrow('JWT_EXPIRES_IN_SECONDS');
    },
  );
});
