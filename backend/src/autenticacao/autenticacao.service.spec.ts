import {
  ValidationPipe,
  UnauthorizedException,
  type INestApplication,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { randomBytes } from 'node:crypto';
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
