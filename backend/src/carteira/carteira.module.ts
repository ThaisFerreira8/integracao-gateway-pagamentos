import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ContasGatewayModule } from '../contas-gateway/contas-gateway.module';
import { Saque } from '../saques/entities/saque.entity';
import { Transacao } from '../transacoes/entities/transacao.entity';
import { SaquesController } from '../saques/saques.controller';
import { SaquesService } from '../saques/saques.service';
import { CarteiraController } from './carteira.controller';
import { CarteiraService } from './carteira.service';

@Module({
  imports: [ContasGatewayModule, TypeOrmModule.forFeature([Saque, Transacao])],
  controllers: [CarteiraController, SaquesController],
  providers: [CarteiraService, SaquesService],
})
export class CarteiraModule {}
