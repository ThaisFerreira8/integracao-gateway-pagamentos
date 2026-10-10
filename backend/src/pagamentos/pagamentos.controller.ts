import {
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Query,
  Req,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { RequisicaoAutenticada } from '../autenticacao/guards/autenticacao.guard';
import {
  ConsultarPagamentosDto,
  ConsultarReferenciaPagamentoDto,
} from './dtos/consultar-pagamentos.dto';
import { PagamentosService } from './pagamentos.service';

@ApiTags('Consultas locais de pagamentos')
@ApiBearerAuth()
@Controller('pagamentos')
export class PagamentosController {
  constructor(private readonly pagamentos: PagamentosService) {}

  @Get()
  @ApiOperation({
    summary: 'Listar pedidos e transações locais do lojista autenticado',
    description:
      'Não consulta nem concilia o gateway. A execução de Pix/cartão e a conciliação externa permanecem pendentes da confirmação do contrato de resposta. EXPIRED/CANCELLED exigem transações locais nesses estados; o enum do pedido não os suporta.',
  })
  listar(
    @Req() requisicao: RequisicaoAutenticada,
    @Query() consulta: ConsultarPagamentosDto,
  ) {
    return this.pagamentos.listar(requisicao.usuarioAutenticado.id, consulta);
  }

  @Get('referencia')
  @ApiOperation({
    summary:
      'Consultar pedido local pela referência externa do próprio lojista',
  })
  consultarReferencia(
    @Req() requisicao: RequisicaoAutenticada,
    @Query() consulta: ConsultarReferenciaPagamentoDto,
  ) {
    return this.pagamentos.consultarReferencia(
      requisicao.usuarioAutenticado.id,
      consulta.referenciaExterna,
    );
  }

  @Get(':id')
  @ApiOperation({
    summary:
      'Consultar pedido pelo UUID local, verificando a propriedade pelo link',
  })
  consultar(
    @Req() requisicao: RequisicaoAutenticada,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
  ) {
    return this.pagamentos.consultar(requisicao.usuarioAutenticado.id, id);
  }
}
