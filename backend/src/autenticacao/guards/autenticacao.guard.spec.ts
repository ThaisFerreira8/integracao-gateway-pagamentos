import { Controller, Get, Req, type INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { randomBytes, randomUUID } from 'node:crypto';
import request from 'supertest';
import { Usuario } from '../../usuarios/entities/usuario.entity';
import { AutenticacaoController } from '../autenticacao.controller';
import { criarConfiguracaoJwt } from '../autenticacao.module';
import { AutenticacaoService } from '../autenticacao.service';
import { RotaPublica } from '../decoradores/rota-publica.decorator';
import {
  AutenticacaoGuard,
  type RequisicaoAutenticada,
} from './autenticacao.guard';

@Controller('verificacao')
class ControllerTeste {
  @Get('privada')
  privada(@Req() requisicao: RequisicaoAutenticada) {
    return requisicao.usuarioAutenticado;
  }

  @RotaPublica()
  @Get('publica')
  publica() {
    return { publica: true };
  }
}

@RotaPublica()
@Controller('publica-classe')
class ControllerPublicoTeste {
  @Get()
  consultar() {
    return { publica: true };
  }
}

describe('Guard global de autenticação', () => {
  let aplicacao: INestApplication;
  let jwt: JwtService;
  const usuarioId = randomUUID();
  const segredo = randomBytes(32).toString('hex');
  const usuarios = { findOne: jest.fn() };
  const autenticacao = {
    entrar: jest.fn().mockResolvedValue({ tipoToken: 'Bearer' }),
  };

  beforeAll(async () => {
    const valores: Record<string, string> = {
      JWT_SECRET: segredo,
      JWT_EXPIRES_IN_SECONDS: '3600',
    };
    jwt = new JwtService(
      criarConfiguracaoJwt({
        get: (nome: string) => valores[nome],
      } as ConfigService),
    );
    const modulo = await Test.createTestingModule({
      controllers: [
        ControllerTeste,
        ControllerPublicoTeste,
        AutenticacaoController,
      ],
      providers: [
        { provide: JwtService, useValue: jwt },
        { provide: getRepositoryToken(Usuario), useValue: usuarios },
        { provide: AutenticacaoService, useValue: autenticacao },
        { provide: APP_GUARD, useClass: AutenticacaoGuard },
      ],
    }).compile();
    aplicacao = modulo.createNestApplication();
    await aplicacao.init();
  });

  beforeEach(() => {
    jest.clearAllMocks();
    usuarios.findOne.mockResolvedValue({ id: usuarioId });
  });

  afterAll(async () => {
    await aplicacao.close();
  });

  it.each([
    '',
    'Basic credencial-ficticia',
    'Bearer',
    'Bearer token extra',
    'Bearer invalido',
  ])('rejeita cabeçalho ausente ou inválido (%s)', async (cabecalho) => {
    const consulta = request(aplicacao.getHttpServer()).get(
      '/verificacao/privada',
    );
    if (cabecalho) consulta.set('Authorization', cabecalho);
    const resposta = await consulta.expect(401);
    expect(resposta.body.message).toBe('Sessão inválida ou expirada.');
    expect(usuarios.findOne).not.toHaveBeenCalled();
  });

  it('identifica o usuário pelo token e ignora proprietário fornecido pelo cliente', async () => {
    const token = await jwt.signAsync({ sub: usuarioId });
    const resposta = await request(aplicacao.getHttpServer())
      .get('/verificacao/privada?usuarioId=outro-usuario')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(resposta.body).toEqual({ id: usuarioId });
    expect(usuarios.findOne).toHaveBeenCalledWith({
      where: { id: usuarioId },
      select: { id: true },
    });
  });

  it('rejeita token expirado', async () => {
    const token = await jwt.signAsync({ sub: usuarioId }, { expiresIn: -1 });
    await request(aplicacao.getHttpServer())
      .get('/verificacao/privada')
      .set('Authorization', `Bearer ${token}`)
      .expect(401);
    expect(usuarios.findOne).not.toHaveBeenCalled();
  });

  it.each([
    { secret: 'outro-segredo-ficticio' },
    { issuer: 'outro-emissor' },
    { audience: 'outro-publico' },
    { algorithm: 'HS384' as const },
  ])('rejeita assinatura ou finalidade incompatível (%j)', async (opcoes) => {
    const token = await jwt.signAsync({ sub: usuarioId }, opcoes);
    await request(aplicacao.getHttpServer())
      .get('/verificacao/privada')
      .set('Authorization', `Bearer ${token}`)
      .expect(401);
    expect(usuarios.findOne).not.toHaveBeenCalled();
  });

  it.each([{}, { sub: 'identificador-invalido' }, { sub: 123 }])(
    'rejeita sessão sem identificador válido (%j)',
    async (sessao) => {
      // jsonwebtoken não aceita sub numérico na assinatura; nesse caso simula o retorno do verificador.
      if (typeof sessao.sub === 'number') {
        const verificar = jest
          .spyOn(jwt, 'verifyAsync')
          .mockResolvedValue(sessao);
        await request(aplicacao.getHttpServer())
          .get('/verificacao/privada')
          .set('Authorization', 'Bearer token-ficticio')
          .expect(401);
        verificar.mockRestore();
      } else {
        const token = await jwt.signAsync(sessao);
        await request(aplicacao.getHttpServer())
          .get('/verificacao/privada')
          .set('Authorization', `Bearer ${token}`)
          .expect(401);
      }
      expect(usuarios.findOne).not.toHaveBeenCalled();
    },
  );

  it('rejeita sessão de usuário removido', async () => {
    usuarios.findOne.mockResolvedValue(null);
    const token = await jwt.signAsync({ sub: usuarioId });
    await request(aplicacao.getHttpServer())
      .get('/verificacao/privada')
      .set('Authorization', `Bearer ${token}`)
      .expect(401);
  });

  it.each(['/verificacao/publica', '/publica-classe'])(
    'permite rota pública sem sessão (%s)',
    async (caminho) => {
      await request(aplicacao.getHttpServer()).get(caminho).expect(200);
      expect(usuarios.findOne).not.toHaveBeenCalled();
    },
  );

  it('mantém o login público com o guard global ativo', async () => {
    await request(aplicacao.getHttpServer())
      .post('/autenticacao/login')
      .send({ email: 'lojista@example.com', senha: 'senha-ficticia' })
      .expect(200);
    expect(autenticacao.entrar).toHaveBeenCalled();
    expect(usuarios.findOne).not.toHaveBeenCalled();
  });
});
