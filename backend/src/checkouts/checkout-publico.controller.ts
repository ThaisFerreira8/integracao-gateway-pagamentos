import { Controller, Get, Param, ParseUUIDPipe } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { RotaPublica } from '../autenticacao/decoradores/rota-publica.decorator';
import { CheckoutsService } from './checkouts.service';

@ApiTags('Checkout público')
@RotaPublica()
@Controller('checkout')
export class CheckoutPublicoController {
  constructor(private readonly checkouts: CheckoutsService) {}

  @Get(':identificador')
  @ApiOperation({
    summary: 'Consultar checkout pelo identificador público',
    description:
      'Consulta somente os dados do link e as taxas aplicáveis. A execução de Pix/cartão ainda depende da confirmação do contrato de resposta do gateway.',
  })
  consultar(
    @Param('identificador', new ParseUUIDPipe({ version: '4' }))
    identificador: string,
  ) {
    return this.checkouts.consultarPublico(identificador);
  }
}
