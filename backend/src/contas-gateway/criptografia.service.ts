import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

@Injectable()
export class CriptografiaService {
  private readonly chaveMestra: Buffer;
  private readonly contexto = Buffer.from('baas:credencial:v1', 'utf8');

  constructor(configuracao: ConfigService) {
    const chaveConfigurada = configuracao.get<string>('GATEWAY_ENCRYPTION_KEY');
    if (
      typeof chaveConfigurada !== 'string' ||
      !/^[0-9a-fA-F]{64}$/.test(chaveConfigurada)
    ) {
      throw new Error(
        'GATEWAY_ENCRYPTION_KEY deve conter exatamente 64 caracteres hexadecimais (32 bytes).',
      );
    }

    this.chaveMestra = Buffer.from(chaveConfigurada, 'hex');
    const segredoJwt = configuracao.get<string>('JWT_SECRET');
    if (
      segredoJwt &&
      (segredoJwt === chaveConfigurada ||
        this.chaveMestra.equals(Buffer.from(segredoJwt, 'utf8')))
    ) {
      throw new Error(
        'GATEWAY_ENCRYPTION_KEY deve ser independente de JWT_SECRET.',
      );
    }
  }

  criptografar(conteudo: string): string {
    const nonce = randomBytes(12);
    const cifrador = createCipheriv('aes-256-gcm', this.chaveMestra, nonce, {
      authTagLength: 16,
    });
    cifrador.setAAD(this.contexto);
    const cifrado = Buffer.concat([
      cifrador.update(conteudo, 'utf8'),
      cifrador.final(),
    ]);
    const tag = cifrador.getAuthTag();

    // Preserva versão, nonce e tag para recuperar e autenticar o conteúdo posteriormente.
    return [
      'v1',
      nonce.toString('hex'),
      tag.toString('hex'),
      cifrado.toString('hex'),
    ].join(':');
  }

  descriptografar(credencialCriptografada: string): string {
    try {
      const partes =
        typeof credencialCriptografada === 'string'
          ? credencialCriptografada.match(
              /^v1:([0-9a-f]{24}):([0-9a-f]{32}):([0-9a-f]*)$/,
            )
          : null;
      if (!partes || partes[3].length % 2 !== 0) throw new Error();

      const decifrador = createDecipheriv(
        'aes-256-gcm',
        this.chaveMestra,
        Buffer.from(partes[1], 'hex'),
        { authTagLength: 16 },
      );
      decifrador.setAAD(this.contexto);
      decifrador.setAuthTag(Buffer.from(partes[2], 'hex'));
      const recuperado = Buffer.concat([
        decifrador.update(Buffer.from(partes[3], 'hex')),
        decifrador.final(),
      ]);
      return recuperado.toString('utf8');
    } catch {
      // Não devolve conteúdo parcial nem detalhes internos de autenticação da cifra.
      throw new Error('Não foi possível descriptografar a credencial.');
    }
  }
}
