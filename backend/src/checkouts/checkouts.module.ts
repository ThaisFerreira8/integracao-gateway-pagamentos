import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ContasGatewayModule } from '../contas-gateway/contas-gateway.module';
import { Pedido } from '../pedidos/entities/pedido.entity';
import { Transacao } from '../transacoes/entities/transacao.entity';
import { CheckoutPublicoController } from './checkout-publico.controller';
import { CheckoutsController } from './checkouts.controller';
import { CheckoutsService } from './checkouts.service';
import { LinkCheckout } from './entities/link-checkout.entity';
import { PagamentosGatewayService } from './pagamentos-gateway.service';

@Module({
  imports: [
    ContasGatewayModule,
    TypeOrmModule.forFeature([LinkCheckout, Pedido, Transacao]),
  ],
  controllers: [CheckoutsController, CheckoutPublicoController],
  providers: [CheckoutsService, PagamentosGatewayService],
})
export class CheckoutsModule {}
