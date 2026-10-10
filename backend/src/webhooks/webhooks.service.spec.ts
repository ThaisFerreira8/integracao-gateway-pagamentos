import {
  BadGatewayException,
  BadRequestException,
  type INestApplication,
  ValidationPipe,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { Repository } from 'typeorm';
import { AutenticacaoGuard } from '../autenticacao/guards/autenticacao.guard';
import { ContasGatewayService } from '../contas-gateway/contas-gateway.service';
import { GatewayHttpService } from '../contas-gateway/gateway-http.service';
import { Usuario } from '../usuarios/entities/usuario.entity';
import { ConfigurarWebhookDto } from './dtos/configurar-webhook.dto';
import { WebhooksController } from './webhooks.controller';
import { WebhooksService } from './webhooks.service';

describe('Administração privada de webhooks', () => {
  const usuarioId = randomUUID();
  const outroUsuarioId = randomUUID();
  const entrada = {
    event: 'PAYMENT_PIX' as const,
    url: 'https://example.com/callback',
    secret: 'segredo-ficticio',
  };
  const contas = { obterToken: jest.fn() };
  const gateway = { requisitar: jest.fn() };
  const servico = new WebhooksService(
    contas as unknown as ContasGatewayService,
    gateway as unknown as GatewayHttpService,
  );
  const pipe = new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
  });
  let aplicacao: INestApplication;

  beforeAll(async () => {
    const modulo = await Test.createTestingModule({
      controllers: [WebhooksController],
      providers: [{ provide: WebhooksService, useValue: servico }],
    }).compile();
    aplicacao = modulo.createNestApplication();
    aplicacao.useGlobalPipes(pipe);
    // Usa o guard real com verificação JWT e repositório simulados, sem consultar banco ou gateway.
    const jwt = {
      verifyAsync: jest.fn(async (token: string) => {
        if (token === 'sessao-a') return { sub: usuarioId };
        if (token === 'sessao-b') return { sub: outroUsuarioId };
        throw new Error('Sessão fictícia inválida.');
      }),
    };
    const usuarios = {
      findOne: jest.fn(async ({ where }: { where: { id: string } }) => ({
        id: where.id,
      })),
    };
    aplicacao.useGlobalGuards(
      new AutenticacaoGuard(
        new Reflector(),
        jwt as unknown as JwtService,
        usuarios as unknown as Repository<Usuario>,
      ),
    );
    await aplicacao.init();
  });

  afterAll(async () => {
    await aplicacao.close();
  });

  beforeEach(() => {
    contas.obterToken
      .mockReset()
      .mockImplementation(async (id: string) =>
        id === usuarioId ? 'token-a-ficticio' : 'token-b-ficticio',
      );
    gateway.requisitar.mockReset().mockResolvedValue(null);
  });

  it('configura apenas os campos confirmados e descarta qualquer corpo de resposta', async () => {
    gateway.requisitar.mockResolvedValueOnce({
      id: 'NAO-ASSUMIR',
      secret: 'NAO-RETORNAR',
    });
    expect(await servico.configurar(usuarioId, entrada)).toBeUndefined();
    expect(contas.obterToken).toHaveBeenCalledWith(usuarioId);
    expect(gateway.requisitar).toHaveBeenCalledWith('POST', '/webhooks', {
      token: 'token-a-ficticio',
      corpo: entrada,
    });
  });

  it('não envia secret quando ele está ausente', async () => {
    await servico.configurar(usuarioId, {
      event: entrada.event,
      url: entrada.url,
    });
    expect(gateway.requisitar.mock.calls[0][2].corpo).not.toHaveProperty(
      'secret',
    );
  });

  it('aceita somente a lista vazia observada', async () => {
    gateway.requisitar.mockResolvedValueOnce([]);
    expect(await servico.listar(usuarioId)).toEqual([]);
    expect(gateway.requisitar).toHaveBeenCalledWith('GET', '/webhooks', {
      token: 'token-a-ficticio',
    });
  });

  it.each([null, {}, { webhooks: [] }, [{ secret: 'NAO-RETORNAR' }], '[]'])(
    'rejeita estrutura de listagem não confirmada: %j',
    async (retorno) => {
      gateway.requisitar.mockResolvedValueOnce(retorno);
      await expect(servico.listar(usuarioId)).rejects.toMatchObject({
        status: 502,
        message:
          'A estrutura dos itens de configuração de webhook ainda não foi confirmada.',
      });
    },
  );

  it('remove ID opaco codificado em um único segmento e descarta resposta externa', async () => {
    gateway.requisitar.mockResolvedValueOnce({ secret: 'NAO-RETORNAR' });
    expect(await servico.remover(usuarioId, 'id opaco?#')).toBeUndefined();
    expect(gateway.requisitar).toHaveBeenCalledWith(
      'DELETE',
      '/webhooks/id%20opaco%3F%23',
      { token: 'token-a-ficticio' },
    );
  });

  it.each([
    '',
    ' ',
    '.',
    '..',
    '../outro',
    'a/b',
    'a\\b',
    'a\n',
    '\u0000',
    '\ud800',
  ])('rejeita ID inseguro antes de obter o token: %j', async (id) => {
    await expect(servico.remover(usuarioId, id)).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(contas.obterToken).not.toHaveBeenCalled();
    expect(gateway.requisitar).not.toHaveBeenCalled();
  });

  it('não transforma erro do gateway em sucesso nem repete a operação', async () => {
    gateway.requisitar.mockRejectedValueOnce(
      new BadGatewayException('Falha simulada.'),
    );
    await expect(servico.configurar(usuarioId, entrada)).rejects.toBeInstanceOf(
      BadGatewayException,
    );
    expect(gateway.requisitar).toHaveBeenCalledTimes(1);
  });

  it('vínculo indisponível impede chamadas externas', async () => {
    contas.obterToken.mockRejectedValueOnce(
      new BadRequestException('Vínculo necessário.'),
    );
    await expect(servico.listar(usuarioId)).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(gateway.requisitar).not.toHaveBeenCalled();
  });

  it.each(['PAYMENT_PIX', 'PAYMENT_CARD', 'WITHDRAWAL'] as const)(
    'aceita configuração do evento %s',
    async (event) => {
      expect(
        await pipe.transform(
          { ...entrada, event },
          { type: 'body', metatype: ConfigurarWebhookDto },
        ),
      ).toBeInstanceOf(ConfigurarWebhookDto);
    },
  );

  it.each([
    { event: 'OUTRO' },
    { url: 'http://example.com/callback' },
    { url: 'https://usuario:senha@example.com' },
    { url: 'example.com' },
    { secret: null },
    { secret: 123 },
    { secret: '' },
    { secret: ' ' },
    { usuarioId },
  ])(
    'rejeita entrada inválida ou identidade fornecida pelo cliente: %j',
    async (alteracao) => {
      await expect(
        pipe.transform(
          { ...entrada, ...alteracao },
          { type: 'body', metatype: ConfigurarWebhookDto },
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
    },
  );

  it('as três rotas exigem JWT antes de consultar a conta vinculada', async () => {
    await request(aplicacao.getHttpServer())
      .post('/webhooks')
      .send(entrada)
      .expect(401);
    await request(aplicacao.getHttpServer()).get('/webhooks').expect(401);
    await request(aplicacao.getHttpServer())
      .delete('/webhooks/id-opaco')
      .expect(401);
    expect(contas.obterToken).not.toHaveBeenCalled();
    expect(gateway.requisitar).not.toHaveBeenCalled();
  });

  it('POST retorna 204 sem secret ou corpo externo', async () => {
    gateway.requisitar.mockResolvedValueOnce({
      secret: 'NAO-RETORNAR',
      id: 'NAO-ASSUMIR',
    });
    const resposta = await request(aplicacao.getHttpServer())
      .post('/webhooks')
      .set('Authorization', 'Bearer sessao-a')
      .send(entrada)
      .expect(204);
    expect(resposta.text).toBe('');
    expect(gateway.requisitar.mock.calls[0][2].token).toBe('token-a-ficticio');
  });

  it('DELETE utiliza somente a sessão do lojista e retorna 204 vazio', async () => {
    gateway.requisitar.mockResolvedValueOnce({ secret: 'NAO-RETORNAR' });
    const resposta = await request(aplicacao.getHttpServer())
      .delete('/webhooks/id-opaco')
      .query({ usuarioId })
      .set('Authorization', 'Bearer sessao-b')
      .expect(204);
    expect(resposta.text).toBe('');
    expect(contas.obterToken).toHaveBeenCalledWith(outroUsuarioId);
    expect(gateway.requisitar).toHaveBeenCalledWith(
      'DELETE',
      '/webhooks/id-opaco',
      { token: 'token-b-ficticio' },
    );
  });

  it('GET usa o token correto e não expõe lista não confirmada', async () => {
    gateway.requisitar
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ secret: 'NAO-RETORNAR' }]);
    await request(aplicacao.getHttpServer())
      .get('/webhooks')
      .set('Authorization', 'Bearer sessao-a')
      .expect(200, []);
    const resposta = await request(aplicacao.getHttpServer())
      .get('/webhooks')
      .set('Authorization', 'Bearer sessao-b')
      .expect(502);
    expect(JSON.stringify(resposta.body)).not.toContain('NAO-RETORNAR');
    expect(
      gateway.requisitar.mock.calls.map((chamada) => chamada[2].token),
    ).toEqual(['token-a-ficticio', 'token-b-ficticio']);
  });

  it('validação HTTP rejeita usuarioId e URL insegura sem chamar gateway', async () => {
    await request(aplicacao.getHttpServer())
      .post('/webhooks')
      .set('Authorization', 'Bearer sessao-a')
      .send({ ...entrada, usuarioId: outroUsuarioId })
      .expect(400);
    await request(aplicacao.getHttpServer())
      .post('/webhooks')
      .set('Authorization', 'Bearer sessao-a')
      .send({ ...entrada, url: 'http://example.com' })
      .expect(400);
    expect(gateway.requisitar).not.toHaveBeenCalled();
  });

  it('Swagger apresenta somente administração, secret writeOnly e respostas sem corpo', () => {
    const documento = SwaggerModule.createDocument(
      aplicacao,
      new DocumentBuilder().addBearerAuth().build(),
    );
    expect(Object.keys(documento.paths).sort()).toEqual([
      '/webhooks',
      '/webhooks/{id}',
    ]);
    expect(documento.paths['/webhooks'].post?.responses).toHaveProperty('204');
    expect(documento.paths['/webhooks/{id}'].delete?.responses).toHaveProperty(
      '204',
    );
    expect(documento.paths['/webhooks'].post?.security).toEqual([
      { bearer: [] },
    ]);
    const esquema = documento.components?.schemas?.ConfigurarWebhookDto;
    expect(
      esquema && 'properties' in esquema && esquema.properties?.secret,
    ).toMatchObject({ writeOnly: true });
  });
});
