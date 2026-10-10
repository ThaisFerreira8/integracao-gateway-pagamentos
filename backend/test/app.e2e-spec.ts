import {
  BadGatewayException,
  ValidationPipe,
  type INestApplication,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { APP_GUARD } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { getRepositoryToken } from '@nestjs/typeorm';
import request from 'supertest';
import { Usuario } from '../src/usuarios/entities/usuario.entity';
import { AutenticacaoGuard } from '../src/autenticacao/guards/autenticacao.guard';
import { CarteiraController } from '../src/carteira/carteira.controller';
import { CarteiraService } from '../src/carteira/carteira.service';
import { WebhooksController } from '../src/webhooks/webhooks.controller';
import { WebhooksService } from '../src/webhooks/webhooks.service';
import { CheckoutPublicoController } from '../src/checkouts/checkout-publico.controller';
import { CheckoutsService } from '../src/checkouts/checkouts.service';
import { PagamentosGatewayService } from '../src/checkouts/pagamentos-gateway.service';

describe('Rotas financeiras HTTP com autenticação real e serviços simulados', () => {
  let aplicacao: INestApplication;
  let token: string;
  const usuarioId = '7f2630eb-730f-48b8-98bb-b5b9945a4908';
  const identificador = 'fa2630eb-730f-48b8-98bb-b5b9945a4908';
  const carteira = { consultar: jest.fn(), consultarExtrato: jest.fn() };
  const webhooks = {
    listar: jest.fn(),
    configurar: jest.fn(),
    remover: jest.fn(),
  };
  const checkouts = { consultarPublico: jest.fn() };

  beforeAll(async () => {
    // Não importa AppModule: os testes não abrem conexão com MySQL nem chamam o gateway.
    const jwt = new JwtService({
      secret: 'segredo-ficticio-exclusivo-destes-testes-http',
    });
    token = await jwt.signAsync({ sub: usuarioId });
    const modulo = await Test.createTestingModule({
      controllers: [
        CarteiraController,
        WebhooksController,
        CheckoutPublicoController,
      ],
      providers: [
        { provide: JwtService, useValue: jwt },
        {
          provide: getRepositoryToken(Usuario),
          useValue: {
            findOne: jest.fn(async ({ where }: { where: { id: string } }) =>
              where.id === usuarioId ? { id: usuarioId } : null,
            ),
          },
        },
        { provide: APP_GUARD, useClass: AutenticacaoGuard },
        { provide: CarteiraService, useValue: carteira },
        { provide: WebhooksService, useValue: webhooks },
        { provide: CheckoutsService, useValue: checkouts },
        { provide: PagamentosGatewayService, useValue: {} },
      ],
    }).compile();
    aplicacao = modulo.createNestApplication();
    aplicacao.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await aplicacao.init();
  });

  beforeEach(() => {
    jest.clearAllMocks();
    carteira.consultar.mockResolvedValue({
      balance: 123,
      balanceFormatted: 'saldo formatado',
    });
    carteira.consultarExtrato.mockResolvedValue({ transactions: [] });
    webhooks.listar.mockResolvedValue([]);
    webhooks.configurar.mockResolvedValue(undefined);
    webhooks.remover.mockResolvedValue(undefined);
    checkouts.consultarPublico.mockResolvedValue({
      identificadorPublico: identificador,
    });
  });

  afterAll(async () => {
    await aplicacao?.close();
  });

  it.each(['/carteira', '/carteira/extrato', '/webhooks'])(
    'protege GET %s sem JWT',
    async (caminho) => {
      await request(aplicacao.getHttpServer()).get(caminho).expect(401);
    },
  );

  it('rejeita JWT adulterado antes de consultar a carteira', async () => {
    await request(aplicacao.getHttpServer())
      .get('/carteira')
      .set('Authorization', 'Bearer invalido')
      .expect(401);
    expect(carteira.consultar).not.toHaveBeenCalled();
  });

  it('usa a identidade verificada para consultar saldo', async () => {
    await request(aplicacao.getHttpServer())
      .get('/carteira')
      .set('Authorization', 'Bearer ' + token)
      .expect(200);
    expect(carteira.consultar).toHaveBeenCalledWith(usuarioId);
  });

  it('não aceita usuarioId em filtros de extrato', async () => {
    await request(aplicacao.getHttpServer())
      .get('/carteira/extrato?usuarioId=outro')
      .set('Authorization', 'Bearer ' + token)
      .expect(400);
    expect(carteira.consultarExtrato).not.toHaveBeenCalled();
  });

  it('encaminha somente filtros confirmados e limite inteiro', async () => {
    await request(aplicacao.getHttpServer())
      .get('/carteira/extrato?status=APPROVED&type=PIX&limit=7')
      .set('Authorization', 'Bearer ' + token)
      .expect(200);
    expect(carteira.consultarExtrato).toHaveBeenCalledWith(
      usuarioId,
      expect.objectContaining({ status: 'APPROVED', type: 'PIX', limit: 7 }),
    );
  });

  it('preserva falha de contrato do extrato como HTTP 502', async () => {
    carteira.consultarExtrato.mockRejectedValueOnce(
      new BadGatewayException('Contrato não confirmado.'),
    );
    await request(aplicacao.getHttpServer())
      .get('/carteira/extrato')
      .set('Authorization', 'Bearer ' + token)
      .expect(502);
  });

  it('configuração privada retorna 204 sem secret no corpo de resposta', async () => {
    const resposta = await request(aplicacao.getHttpServer())
      .post('/webhooks')
      .set('Authorization', 'Bearer ' + token)
      .send({
        event: 'PAYMENT_PIX',
        url: 'https://destino.example/callback',
        secret: 'secret-apenas-mock',
      })
      .expect(204);
    expect(resposta.text).toBe('');
    expect(webhooks.configurar).toHaveBeenCalledWith(
      usuarioId,
      expect.objectContaining({ event: 'PAYMENT_PIX' }),
    );
  });

  it('rejeita URL HTTP de webhook antes da configuração', async () => {
    await request(aplicacao.getHttpServer())
      .post('/webhooks')
      .set('Authorization', 'Bearer ' + token)
      .send({
        event: 'PAYMENT_PIX',
        url: 'http://destino.example/callback',
      })
      .expect(400);
    expect(webhooks.configurar).not.toHaveBeenCalled();
  });

  it('consulta pública do checkout não exige JWT', async () => {
    await request(aplicacao.getHttpServer())
      .get('/checkout/' + identificador)
      .expect(200);
    expect(checkouts.consultarPublico).toHaveBeenCalledWith(identificador);
  });

  it('consulta pública rejeita identificador inválido', async () => {
    await request(aplicacao.getHttpServer())
      .get('/checkout/invalido')
      .expect(400);
    expect(checkouts.consultarPublico).not.toHaveBeenCalled();
  });
});
