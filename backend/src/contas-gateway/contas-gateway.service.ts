import {
  BadGatewayException,
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { QueryFailedError, Repository } from 'typeorm';
import { CriptografiaService } from './criptografia.service';
import {
  CadastrarContaGatewayDto,
  VincularContaGatewayDto,
} from './dtos/cadastrar-conta-gateway.dto';
import { ContaGateway } from './entities/conta-gateway.entity';
import { GatewayHttpService } from './gateway-http.service';
import type {
  PerfilGateway,
  RetornoLoginGateway,
} from './tipos/contrato-gateway';

@Injectable()
export class ContasGatewayService {
  constructor(
    @InjectRepository(ContaGateway)
    private readonly contas: Repository<ContaGateway>,
    private readonly gateway: GatewayHttpService,
    private readonly criptografia: CriptografiaService,
  ) {}

  async cadastrar(usuarioId: string, entrada: CadastrarContaGatewayDto) {
    if (await this.contas.findOneBy({ usuarioId })) {
      throw new ConflictException('O lojista já possui uma conta vinculada.');
    }
    await this.gateway.requisitar<unknown>('POST', '/users', {
      corpo: {
        personType: entrada.tipoPessoa,
        name: entrada.nome,
        tradingName: entrada.nomeFantasia,
        email: entrada.email,
        phone: entrada.telefone,
        document: entrada.documento,
        zipCode: entrada.cep,
        address: entrada.endereco,
        number: entrada.numero,
        complement: entrada.complemento,
        neighborhood: entrada.bairro,
        city: entrada.cidade,
        state: entrada.estado,
      },
    });
    // O cadastro não retorna credenciais; elas são entregues pelo gateway por e-mail.
    return {
      mensagem:
        'Cadastro solicitado ao gateway. Verifique o e-mail informado para obter o acesso.',
    };
  }

  async vincular(usuarioId: string, entrada: VincularContaGatewayDto) {
    const existente = await this.contas.findOneBy({ usuarioId });
    if (existente && existente.documento !== entrada.documento) {
      throw new ConflictException(
        'Não é permitido substituir a conta vinculada por outra conta.',
      );
    }

    const acesso = await this.gateway.requisitar<RetornoLoginGateway>(
      'POST',
      '/auth/login',
      {
        corpo: { document: entrada.documento, password: entrada.senha },
      },
    );
    if (
      !acesso ||
      typeof acesso.access_token !== 'string' ||
      !/^\S+$/.test(acesso.access_token) ||
      typeof acesso.token_type !== 'string' ||
      acesso.token_type.toLowerCase() !== 'bearer' ||
      !Number.isSafeInteger(acesso.codigoCliente) ||
      acesso.codigoCliente < 0 ||
      typeof acesso.chaveLoja !== 'string' ||
      !acesso.chaveLoja ||
      !acesso.user ||
      typeof acesso.user.id !== 'string' ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
        acesso.user.id,
      ) ||
      acesso.user.document !== entrada.documento
    ) {
      throw new BadGatewayException(
        'O gateway retornou dados de autenticação incompatíveis.',
      );
    }

    const perfil = await this.gateway.requisitar<PerfilGateway>(
      'GET',
      '/users/me',
      { token: acesso.access_token },
    );
    if (
      !perfil ||
      perfil.id !== acesso.user.id ||
      perfil.document !== entrada.documento ||
      perfil.codigoCliente !== acesso.codigoCliente ||
      perfil.chaveLoja !== acesso.chaveLoja
    ) {
      throw new BadGatewayException(
        'Não foi possível confirmar a identidade da conta no gateway.',
      );
    }
    if (existente && existente.identificadorGateway !== perfil.id) {
      throw new ConflictException(
        'A identidade da conta vinculada não pode ser alterada.',
      );
    }
    const proprietaria = await this.contas.findOneBy({
      identificadorGateway: perfil.id,
    });
    if (proprietaria && proprietaria.usuarioId !== usuarioId) {
      throw new ConflictException(
        'Esta conta do gateway já está vinculada a outro lojista.',
      );
    }

    const conta = this.contas.create({
      id: existente?.id,
      usuarioId,
      identificadorGateway: perfil.id,
      documento: entrada.documento,
      codigoCliente: acesso.codigoCliente,
      tokenCriptografado: this.criptografia.criptografar(acesso.access_token),
      chaveLojaCriptografada: this.criptografia.criptografar(acesso.chaveLoja),
      tokenExpiraEm: this.obterExpiracao(acesso.access_token),
    });
    try {
      return this.apresentarConta(await this.contas.save(conta));
    } catch (erro) {
      if (
        erro instanceof QueryFailedError &&
        erro.driverError?.code === 'ER_DUP_ENTRY'
      ) {
        throw new ConflictException(
          'O vínculo já existe. Consulte a conta vinculada antes de tentar novamente.',
        );
      }
      // Erros de persistência podem conter parâmetros da consulta; não os repassa ao cliente.
      throw new BadGatewayException(
        'Não foi possível persistir o vínculo da conta.',
      );
    }
  }

  async consultar(usuarioId: string) {
    const conta = await this.contas.findOneBy({ usuarioId });
    if (!conta)
      throw new NotFoundException(
        'O lojista ainda não possui conta vinculada.',
      );
    return this.apresentarConta(conta);
  }

  async obterToken(usuarioId: string): Promise<string> {
    const conta = await this.contas.findOne({
      where: { usuarioId },
      select: { id: true, tokenCriptografado: true, tokenExpiraEm: true },
    });
    if (
      !conta?.tokenCriptografado ||
      (conta.tokenExpiraEm && conta.tokenExpiraEm.getTime() <= Date.now())
    ) {
      throw new BadRequestException(
        'Vincule novamente a conta para renovar o acesso ao gateway.',
      );
    }
    return this.criptografia.descriptografar(conta.tokenCriptografado);
  }

  private apresentarConta(conta: ContaGateway) {
    return {
      id: conta.id,
      vinculada: true,
      tokenExpiraEm: conta.tokenExpiraEm,
    };
  }

  private obterExpiracao(token: string): Date | null {
    // A claim é apenas uma indicação de validade; a identidade foi confirmada em /users/me.
    try {
      const partes = token.split('.');
      if (partes.length !== 3) return null;
      const dados: unknown = JSON.parse(
        Buffer.from(partes[1], 'base64url').toString('utf8'),
      );
      if (
        typeof dados !== 'object' ||
        dados === null ||
        !('exp' in dados) ||
        typeof dados.exp !== 'number' ||
        !Number.isSafeInteger(dados.exp)
      )
        return null;
      const instante = new Date(dados.exp * 1000);
      return Number.isNaN(instante.getTime()) ? null : instante;
    } catch {
      return null;
    }
  }
}
