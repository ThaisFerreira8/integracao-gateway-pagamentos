import { Controller, Get, Query, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { RequisicaoAutenticada } from '../autenticacao/guards/autenticacao.guard';
import { CarteiraService } from './carteira.service';
import { ConsultarExtratoDto } from './dtos/operacoes-financeiras.dto';

@ApiTags('Carteira do lojista')
@ApiBearerAuth()
@Controller('carteira')
export class CarteiraController {
  constructor(private readonly carteira: CarteiraService) {}

  @Get()
  @ApiOperation({
    summary: 'Consultar carteira da conta vinculada',
    description:
      'Preserva balance sem conversão: a unidade monetária ainda não foi comprovada.',
  })
  consultar(@Req() requisicao: RequisicaoAutenticada) {
    return this.carteira.consultar(requisicao.usuarioAutenticado.id);
  }

  @Get('extrato')
  @ApiOperation({
    summary: 'Consultar extrato consolidado do lojista com filtros',
    description:
      'Consolida registros locais e externos por identificador ou referência única. O estado externo prevalece quando há correspondência comprovada. Sem page, offset ou cursor; limit restringe o resultado consolidado e a consulta externa. Não altera registros locais.',
  })
  consultarExtrato(
    @Req() requisicao: RequisicaoAutenticada,
    @Query() consulta: ConsultarExtratoDto,
  ) {
    return this.carteira.consultarExtrato(
      requisicao.usuarioAutenticado.id,
      consulta,
    );
  }
}
