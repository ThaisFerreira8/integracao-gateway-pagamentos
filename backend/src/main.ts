import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';

async function iniciarAplicacao() {
  const aplicacao = await NestFactory.create(AppModule);
  const configuracao = aplicacao.get(ConfigService);

  // Rejeita campos que não estejam declarados nos DTOs de entrada.
  aplicacao.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  aplicacao.enableCors({
    origin: configuracao.get<string>('FRONTEND_URL', 'http://localhost:5173'),
  });

  const configuracaoSwagger = new DocumentBuilder()
    .setTitle('API BaaS - Integração com Gateway')
    .setDescription('API da aplicação para lojistas e checkout de pagamentos.')
    .setVersion('1.0')
    .addBearerAuth()
    .build();

  const documentoSwagger = SwaggerModule.createDocument(
    aplicacao,
    configuracaoSwagger,
  );

  SwaggerModule.setup('docs', aplicacao, documentoSwagger);

  await aplicacao.listen(configuracao.get<string>('PORT', '3000'));
}

void iniciarAplicacao();
