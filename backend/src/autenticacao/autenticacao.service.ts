import {
  ConflictException,
  Injectable,
  InternalServerErrorException,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { QueryFailedError, Repository } from 'typeorm';
import { CadastrarLojistaDto } from './dtos/cadastrar-lojista.dto';
import { Usuario } from '../usuarios/entities/usuario.entity';
import { LoginDto } from './dtos/login.dto';

const derivarSenha = promisify(scrypt);

@Injectable()
export class AutenticacaoService {
  constructor(
    @InjectRepository(Usuario)
    private readonly usuarios: Repository<Usuario>,
    private readonly jwt: JwtService,
  ) {}

  async gerarHashSenha(senha: string): Promise<string> {
    const sal = randomBytes(16).toString('hex');
    const hash = (await derivarSenha(senha, sal, 64)) as Buffer;
    return `scrypt:${sal}:${hash.toString('hex')}`;
  }

  async cadastrar(entrada: CadastrarLojistaDto) {
    const email = entrada.email.trim().toLowerCase();
    if (await this.usuarios.findOneBy({ email })) {
      throw new ConflictException('Este e-mail já possui uma conta.');
    }
    const usuario = this.usuarios.create({
      nome: entrada.nome.trim(),
      email,
      senhaHash: await this.gerarHashSenha(entrada.senha),
    });
    try {
      const criado = await this.usuarios.save(usuario);
      // Cadastro somente local; não emite token nem aciona o gateway.
      return { id: criado.id, nome: criado.nome, email: criado.email };
    } catch (erro) {
      if (
        erro instanceof QueryFailedError &&
        erro.driverError?.code === 'ER_DUP_ENTRY'
      ) {
        throw new ConflictException('Este e-mail já possui uma conta.');
      }
      // Não repassa erros de banco, que podem conter parâmetros e hash de senha.
      throw new InternalServerErrorException(
        'Não foi possível criar sua conta.',
      );
    }
  }

  async entrar(entrada: LoginDto) {
    const usuario = await this.usuarios
      .createQueryBuilder('usuario')
      .addSelect('usuario.senhaHash')
      .where('usuario.email = :email', {
        email: entrada.email.trim().toLowerCase(),
      })
      .getOne();

    const senhaValida = await this.verificarSenha(
      entrada.senha,
      usuario?.senhaHash,
    );
    if (!usuario || !senhaValida) {
      throw new UnauthorizedException('E-mail ou senha inválidos.');
    }

    const tokenAcesso = await this.jwt.signAsync({ sub: usuario.id });
    // Expõe somente os dados necessários à sessão, sem serializar a entidade inteira.
    return {
      tokenAcesso,
      tipoToken: 'Bearer',
      usuario: { id: usuario.id, nome: usuario.nome, email: usuario.email },
    };
  }

  private async verificarSenha(
    senha: string,
    senhaHash?: string,
  ): Promise<boolean> {
    const partes = senhaHash?.match(/^scrypt:([0-9a-f]{32}):([0-9a-f]{128})$/);
    // Executa a derivação também para usuários ausentes ou hashes inválidos.
    const sal = partes?.[1] ?? '0'.repeat(32);
    const esperado = Buffer.from(partes?.[2] ?? '0'.repeat(128), 'hex');
    const calculado = (await derivarSenha(senha, sal, 64)) as Buffer;
    const coincide = timingSafeEqual(calculado, esperado);
    return Boolean(partes) && coincide;
  }
}
