import { Controller, Get, Param, ParseUUIDPipe, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { RequisicaoAutenticada } from '../autenticacao/guards/autenticacao.guard';
import { SaquesService } from './saques.service';

@ApiTags('Consultas locais de saques')
@ApiBearerAuth()
@Controller('saques')
export class SaquesController {
  constructor(private readonly saques: SaquesService) {}

  @Get()
  @ApiOperation({
    summary: 'Listar saques locais do lojista',
    description:
      'Não solicita nem consulta saques no gateway. Essas operações dependem da confirmação do contrato de resposta para persistência segura.',
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
