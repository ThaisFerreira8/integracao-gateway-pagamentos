import {
  Module,
  type MiddlewareConsumer,
  type NestModule,
} from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { CorrelacaoRequisicoesMiddleware } from './comum/middlewares/correlacao-requisicoes.middleware';
import { AutenticacaoModule } from './autenticacao/autenticacao.module';
import { ContasGatewayModule } from './contas-gateway/contas-gateway.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      override: true,
    }),

    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        type: 'mysql',
        host: configService.get<string>('DB_HOST'),
        port: Number(configService.get<string>('DB_PORT')),
        username: configService.get<string>('DB_USERNAME'),
        password: configService.get<string>('DB_PASSWORD'),
        database: configService.get<string>('DB_DATABASE'),
        autoLoadEntities: true,
        synchronize: false,
      }),
    }),
    AutenticacaoModule,
    ContasGatewayModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule implements NestModule {
  configure(consumidor: MiddlewareConsumer): void {
    consumidor.apply(CorrelacaoRequisicoesMiddleware).forRoutes('{*caminho}');
  }
}
