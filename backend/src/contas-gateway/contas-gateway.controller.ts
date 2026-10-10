import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Req,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';
import type { RequisicaoAutenticada } from '../autenticacao/guards/autenticacao.guard';
import { ContasGatewayService } from './contas-gateway.service';
import {
  CadastrarContaGatewayDto,
  VincularContaGatewayDto,
} from './dtos/cadastrar-conta-gateway.dto';

@ApiTags('Contas do gateway')
@ApiBearerAuth()
@Controller('contas-gateway')
export class ContasGatewayController {
  constructor(
    private readonly contas: ContasGatewayService,
    private readonly configuracao: ConfigService,
  ) {}

  @Post('cadastro')
  @ApiOperation({ summary: 'Solicitar cadastro PF/PJ no gateway' })
  cadastrar(
    @Req() requisicao: RequisicaoAutenticada,
    @Body() entrada: CadastrarContaGatewayDto,
  ) {
    return this.contas.cadastrar(requisicao.usuarioAutenticado.id, entrada);
  }

  @Post('vinculo')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Vincular ou renovar acesso à conta do lojista; HTTPS em produção',
  })
  vincular(
    @Req() requisicao: RequisicaoAutenticada,
    @Body() entrada: VincularContaGatewayDto,
  ) {
    const ambiente = this.configuracao.get<string>('NODE_ENV', 'development');
    // A exceção local exige conexão de loopback, além do nome do host.
    const acessoLocal =
      ['development', 'test'].includes(ambiente) &&
      ['localhost', '127.0.0.1', '::1', '[::1]'].includes(
        requisicao.hostname,
      ) &&
      ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(
        requisicao.socket.remoteAddress ?? '',
      );

    if (!requisicao.secure && !acessoLocal) {
      throw new BadRequestException(
        'O vínculo da conta deve ser enviado por HTTPS.',
      );
    }
    return this.contas.vincular(requisicao.usuarioAutenticado.id, entrada);
  }

  @Get()
  @ApiOperation({
    summary: 'Consultar o vínculo do lojista sem expor credenciais',
  })
  consultar(@Req() requisicao: RequisicaoAutenticada) {
    return this.contas.consultar(requisicao.usuarioAutenticado.id);
  }
}
