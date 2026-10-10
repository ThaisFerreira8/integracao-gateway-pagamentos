import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ContaGateway } from './entities/conta-gateway.entity';
import { CriptografiaService } from './criptografia.service';

@Module({
  imports: [ConfigModule, TypeOrmModule.forFeature([ContaGateway])],
  providers: [CriptografiaService],
  exports: [CriptografiaService, TypeOrmModule],
})
export class ContasGatewayModule {}
