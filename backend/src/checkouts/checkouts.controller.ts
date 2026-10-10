import {
  Body,
  Controller,
  Get,
  Post,
  Query,
  Req,
  Param,
  ParseUUIDPipe,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { RequisicaoAutenticada } from '../autenticacao/guards/autenticacao.guard';
import { CheckoutsService } from './checkouts.service';
import { ConsultaTaxasDto, CriarCheckoutDto } from './dtos/checkout.dto';
import { PagamentosGatewayService } from './pagamentos-gateway.service';

@ApiTags('Checkouts do lojista')
@ApiBearerAuth()
@Controller('checkouts')
export class CheckoutsController {
  constructor(
    private readonly checkouts: CheckoutsService,
    private readonly pagamentos: PagamentosGatewayService,
  ) {}

  @Post(':identificador/conciliar')
  @ApiOperation({
    summary:
      'Conciliar pagamento externo do próprio lojista por identificador e referência externa',
  })
  conciliar(
    @Req() requisicao: RequisicaoAutenticada,
    @Param('identificador', new ParseUUIDPipe({ version: '4' }))
    identificador: string,
  ) {
    return this.pagamentos.conciliar(
      requisicao.usuarioAutenticado.id,
      identificador,
    );
  }

  @Get('taxas')
  @ApiOperation({
    summary: 'Consultar taxas de cartão com filtro opcional por bandeira',
  })
  consultarTaxas(@Query() consulta: ConsultaTaxasDto) {
    return this.checkouts.consultarTaxas(consulta.bandeira);
  }

  @Post()
  @ApiOperation({ summary: 'Criar link e pedido para o lojista autenticado' })
  criar(
    @Req() requisicao: RequisicaoAutenticada,
    @Body() entrada: CriarCheckoutDto,
  ) {
    return this.checkouts.criar(requisicao.usuarioAutenticado.id, entrada);
  }

  @Get()
  @ApiOperation({ summary: 'Listar somente os links do lojista autenticado' })
  listar(@Req() requisicao: RequisicaoAutenticada) {
    return this.checkouts.listar(requisicao.usuarioAutenticado.id);
  }
}
