import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { LinkCheckout } from '../checkouts/entities/link-checkout.entity';
import { Pedido } from '../pedidos/entities/pedido.entity';
import { Transacao } from '../transacoes/entities/transacao.entity';
import { PagamentosController } from './pagamentos.controller';
import { PagamentosService } from './pagamentos.service';

@Module({
  imports: [TypeOrmModule.forFeature([Pedido, LinkCheckout, Transacao])],
  controllers: [PagamentosController],
  providers: [PagamentosService],
})
export class PagamentosModule {}
