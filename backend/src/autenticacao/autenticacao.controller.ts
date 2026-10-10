import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import {
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
  ApiCreatedResponse,
} from '@nestjs/swagger';
import { AutenticacaoService } from './autenticacao.service';
import { LoginDto } from './dtos/login.dto';
import { CadastrarLojistaDto } from './dtos/cadastrar-lojista.dto';
import { RotaPublica } from './decoradores/rota-publica.decorator';

@ApiTags('Autenticação')
@Controller('autenticacao')
export class AutenticacaoController {
  constructor(private readonly autenticacao: AutenticacaoService) {}

  @Post('cadastro')
  @RotaPublica()
  @ApiOperation({
    summary: 'Criar usuário local do BaaS',
    description:
      'Não cadastra conta no gateway. Após o cadastro, utilize o login.',
  })
  @ApiCreatedResponse({
    description: 'Usuário criado; retorna somente id, nome e email.',
  })
  cadastrar(@Body() entrada: CadastrarLojistaDto) {
    return this.autenticacao.cadastrar(entrada);
  }

  @Post('login')
  @RotaPublica()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Autenticar o lojista na aplicação BaaS' })
  @ApiOkResponse({
    description: 'Sessão criada.',
    schema: {
      type: 'object',
      required: ['tokenAcesso', 'tipoToken', 'usuario'],
      properties: {
        tokenAcesso: { type: 'string' },
        tipoToken: { type: 'string', enum: ['Bearer'] },
        usuario: {
          type: 'object',
          required: ['id', 'nome', 'email'],
          properties: {
            id: { type: 'string' },
            nome: { type: 'string' },
            email: { type: 'string' },
          },
        },
      },
    },
  })
  @ApiUnauthorizedResponse({ description: 'E-mail ou senha inválidos.' })
  entrar(@Body() entrada: LoginDto) {
    return this.autenticacao.entrar(entrada);
  }
}
