import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ContaGateway } from './entities/conta-gateway.entity';
import { CriptografiaService } from './criptografia.service';
import { GatewayHttpService } from './gateway-http.service';
import { ContasGatewayController } from './contas-gateway.controller';
import { ContasGatewayService } from './contas-gateway.service';

@Module({
  imports: [ConfigModule, TypeOrmModule.forFeature([ContaGateway])],
  controllers: [ContasGatewayController],
  providers: [CriptografiaService, GatewayHttpService, ContasGatewayService],
  exports: [
    CriptografiaService,
    GatewayHttpService,
    ContasGatewayService,
    TypeOrmModule,
  ],
})
export class ContasGatewayModule {}
