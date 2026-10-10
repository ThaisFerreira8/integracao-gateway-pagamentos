import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ContaGateway } from './entities/conta-gateway.entity';
import { CriptografiaService } from './criptografia.service';
import { GatewayHttpService } from './gateway-http.service';

@Module({
  imports: [ConfigModule, TypeOrmModule.forFeature([ContaGateway])],
  providers: [CriptografiaService, GatewayHttpService],
  exports: [CriptografiaService, GatewayHttpService, TypeOrmModule],
})
export class ContasGatewayModule {}
