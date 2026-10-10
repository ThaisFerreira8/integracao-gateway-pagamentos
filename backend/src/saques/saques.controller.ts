import {
  Body,
  Controller,
  Get,
  Post,
  Param,
  ParseUUIDPipe,
  Req,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { RequisicaoAutenticada } from '../autenticacao/guards/autenticacao.guard';
import { SaquesService } from './saques.service';
import { SolicitarSaqueDto } from '../carteira/dtos/operacoes-financeiras.dto';

@ApiTags('Consultas locais de saques')
@ApiBearerAuth()
@Controller('saques')
export class SaquesController {
  constructor(private readonly saques: SaquesService) {}

  @Post()
  @ApiOperation({
    summary: 'Solicitar saque em centavos para a conta do lojista autenticado',
  })
  solicitar(
    @Req() requisicao: RequisicaoAutenticada,
    @Body() entrada: SolicitarSaqueDto,
  ) {
    return this.saques.solicitar(requisicao.usuarioAutenticado.id, entrada);
  }

  @Post(':id/conciliar')
  @ApiOperation({
    summary:
      'Consultar estado externo do próprio saque e atualizar o registro local',
  })
  conciliar(
    @Req() requisicao: RequisicaoAutenticada,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
  ) {
    return this.saques.consultarExterno(requisicao.usuarioAutenticado.id, id);
  }

  @Get()
  @ApiOperation({
    summary: 'Listar saques locais do lojista',
    description:
      'Lista somente registros locais. Use a rota de conciliação para consultar o estado externo.',
  })
  listar(@Req() requisicao: RequisicaoAutenticada) {
    return this.saques.listar(requisicao.usuarioAutenticado.id);
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Consultar saque pelo UUID local do próprio lojista',
  })
  consultar(
    @Req() requisicao: RequisicaoAutenticada,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
  ) {
    return this.saques.consultar(requisicao.usuarioAutenticado.id, id);
  }
}
