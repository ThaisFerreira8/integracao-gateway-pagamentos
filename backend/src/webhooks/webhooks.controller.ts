import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Req,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiNoContentResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import type { RequisicaoAutenticada } from '../autenticacao/guards/autenticacao.guard';
import { ConfigurarWebhookDto } from './dtos/configurar-webhook.dto';
import { WebhooksService } from './webhooks.service';

@ApiTags('Administração de webhooks')
@ApiBearerAuth()
@Controller('webhooks')
export class WebhooksController {
  constructor(private readonly webhooks: WebhooksService) {}

  @Post()
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiNoContentResponse({
    description:
      'Configuração aceita pelo gateway, sem retornar seu corpo desconhecido.',
  })
  @ApiOperation({
    summary: 'Cadastrar ou atualizar configuração de webhook do lojista',
    description:
      'Somente administração. O BaaS não disponibiliza receptor, validação HMAC, idempotência de callbacks ou atualização financeira. Não há persistência local do secret. Respostas inválidas do gateway geram erro e a operação não é repetida automaticamente.',
  })
  async configurar(
    @Req() requisicao: RequisicaoAutenticada,
    @Body() entrada: ConfigurarWebhookDto,
  ): Promise<void> {
    await this.webhooks.configurar(requisicao.usuarioAutenticado.id, entrada);
  }

  @Get()
  @ApiOperation({
    summary: 'Consultar configurações do gateway para o lojista',
    description:
      'Somente a lista vazia está confirmada. Listas não vazias ou outros formatos retornam HTTP 502 sem expor itens desconhecidos.',
  })
  listar(@Req() requisicao: RequisicaoAutenticada) {
    return this.webhooks.listar(requisicao.usuarioAutenticado.id);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiParam({
    name: 'id',
    type: String,
    description:
      'Identificador opaco, sem interpretar UUID ou número. Deve representar um único segmento seguro de URL.',
  })
  @ApiNoContentResponse({
    description: 'Remoção aceita pelo gateway, sem corpo de resposta.',
  })
  @ApiOperation({
    summary: 'Remover configuração usando o token do próprio lojista',
  })
  async remover(
    @Req() requisicao: RequisicaoAutenticada,
    @Param('id') id: string,
  ): Promise<void> {
    await this.webhooks.remover(requisicao.usuarioAutenticado.id, id);
  }
}
