import { Module } from '@nestjs/common';
import { ContasGatewayModule } from '../contas-gateway/contas-gateway.module';
import { WebhooksController } from './webhooks.controller';
import { WebhooksService } from './webhooks.service';

@Module({
  imports: [ContasGatewayModule],
  controllers: [WebhooksController],
  providers: [WebhooksService],
})
export class WebhooksModule {}
