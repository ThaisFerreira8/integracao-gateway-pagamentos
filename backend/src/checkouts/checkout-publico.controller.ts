import {
  Body,
  Controller,
  Get,
  Post,
  Param,
  ParseUUIDPipe,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { RotaPublica } from '../autenticacao/decoradores/rota-publica.decorator';
import { CheckoutsService } from './checkouts.service';
import { PagamentosGatewayService } from './pagamentos-gateway.service';
import { PagarPixDto, PagarCartaoDto } from './dtos/checkout.dto';

@ApiTags('Checkout público')
@RotaPublica()
@Controller('checkout')
export class CheckoutPublicoController {
  constructor(
    private readonly checkouts: CheckoutsService,
    private readonly pagamentos: PagamentosGatewayService,
  ) {}

  @Post(':identificador/pix')
  @ApiOperation({
    summary:
      'Executar Pix do checkout público; valor e referência definidos pelo BaaS',
  })
  pagarPix(
    @Param('identificador', new ParseUUIDPipe({ version: '4' }))
    identificador: string,
    @Body() entrada: PagarPixDto,
  ) {
    return this.pagamentos.pagarPix(identificador, entrada);
  }

  @Post(':identificador/cartao')
  @ApiOperation({
    summary:
      'Executar cartão com taxa consultada pelo BaaS; dados do cartão somente transitórios',
  })
  pagarCartao(
    @Param('identificador', new ParseUUIDPipe({ version: '4' }))
    identificador: string,
    @Body() entrada: PagarCartaoDto,
  ) {
    return this.pagamentos.pagarCartao(identificador, entrada);
  }

  @Get(':identificador')
  @ApiOperation({
    summary: 'Consultar checkout pelo identificador público',
    description:
      'Consulta os dados do link e as taxas disponíveis; pagamento pelos endpoints Pix/cartão deste checkout.',
  })
  consultar(
    @Param('identificador', new ParseUUIDPipe({ version: '4' }))
    identificador: string,
  ) {
    return this.checkouts.consultarPublico(identificador);
  }
}
