import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule, type JwtModuleOptions } from '@nestjs/jwt';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ContaGateway } from '../contas-gateway/entities/conta-gateway.entity';
import { Usuario } from '../usuarios/entities/usuario.entity';
import { AutenticacaoController } from './autenticacao.controller';
import { AutenticacaoService } from './autenticacao.service';

export function criarConfiguracaoJwt(
  configuracao: ConfigService,
): JwtModuleOptions {
  const segredo = configuracao.get<string>('JWT_SECRET');
  const duracaoConfigurada = configuracao.get<string>('JWT_EXPIRES_IN_SECONDS');
  const duracaoSegundos = Number(duracaoConfigurada);

  if (!segredo?.trim() || Buffer.byteLength(segredo, 'utf8') < 32) {
    throw new Error(
      'JWT_SECRET deve conter um segredo próprio de pelo menos 32 bytes.',
    );
  }

  if (
    !duracaoConfigurada ||
    !/^\d+$/.test(duracaoConfigurada) ||
    !Number.isSafeInteger(duracaoSegundos) ||
    duracaoSegundos <= 0
  ) {
    throw new Error(
      'JWT_EXPIRES_IN_SECONDS deve ser um inteiro positivo em segundos.',
    );
  }

  return {
    secret: segredo,
    signOptions: {
      algorithm: 'HS256',
      expiresIn: duracaoSegundos,
      issuer: 'baas',
      audience: 'lojista',
    },
    verifyOptions: {
      algorithms: ['HS256'],
      issuer: 'baas',
      audience: 'lojista',
    },
  };
}

@Module({
  imports: [
    TypeOrmModule.forFeature([Usuario, ContaGateway]),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: criarConfiguracaoJwt,
    }),
  ],
  controllers: [AutenticacaoController],
  providers: [AutenticacaoService],
  exports: [AutenticacaoService, JwtModule],
})
export class AutenticacaoModule {}
