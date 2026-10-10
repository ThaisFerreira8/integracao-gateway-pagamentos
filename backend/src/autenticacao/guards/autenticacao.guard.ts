import {
  Injectable,
  UnauthorizedException,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import type { Request } from 'express';
import { Repository } from 'typeorm';
import { Usuario } from '../../usuarios/entities/usuario.entity';
import { CHAVE_ROTA_PUBLICA } from '../decoradores/rota-publica.decorator';

export type RequisicaoAutenticada = Request & {
  usuarioAutenticado: { id: string };
};

@Injectable()
export class AutenticacaoGuard implements CanActivate {
  constructor(
    private readonly refletor: Reflector,
    private readonly jwt: JwtService,
    @InjectRepository(Usuario)
    private readonly usuarios: Repository<Usuario>,
  ) {}

  async canActivate(contexto: ExecutionContext): Promise<boolean> {
    const publica = this.refletor.getAllAndOverride<boolean>(
      CHAVE_ROTA_PUBLICA,
      [contexto.getHandler(), contexto.getClass()],
    );
    if (publica) return true;

    const requisicao = contexto
      .switchToHttp()
      .getRequest<RequisicaoAutenticada>();
    const cabecalho = requisicao.headers.authorization;
    const token =
      typeof cabecalho === 'string'
        ? cabecalho.match(/^Bearer (\S+)$/i)?.[1]
        : undefined;
    if (!token) throw new UnauthorizedException('Sessão inválida ou expirada.');

    let sessao: { sub?: unknown };
    try {
      sessao = await this.jwt.verifyAsync<{ sub?: unknown }>(token);
    } catch {
      throw new UnauthorizedException('Sessão inválida ou expirada.');
    }

    if (
      typeof sessao.sub !== 'string' ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
        sessao.sub,
      )
    ) {
      throw new UnauthorizedException('Sessão inválida ou expirada.');
    }

    const usuario = await this.usuarios.findOne({
      where: { id: sessao.sub },
      select: { id: true },
    });
    if (!usuario)
      throw new UnauthorizedException('Sessão inválida ou expirada.');

    // O proprietário é definido pelo token verificado, nunca por parâmetros do cliente.
    requisicao.usuarioAutenticado = { id: usuario.id };
    return true;
  }
}
