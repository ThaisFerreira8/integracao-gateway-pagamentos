import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { randomBytes } from 'node:crypto';
import { ContasGatewayModule } from './contas-gateway.module';
import { CriptografiaService } from './criptografia.service';
import { ContaGateway } from './entities/conta-gateway.entity';

const configurar = (chave: string | undefined, segredoJwt?: string) => {
  const valores: Record<string, string | undefined> = {
    GATEWAY_ENCRYPTION_KEY: chave,
    JWT_SECRET: segredoJwt,
  };
  return { get: (nome: string) => valores[nome] } as ConfigService;
};

describe('Criptografia de credenciais do gateway', () => {
  let chave: string;
  let servico: CriptografiaService;

  beforeEach(() => {
    chave = randomBytes(32).toString('hex');
    servico = new CriptografiaService(configurar(chave));
  });

  it.each(['credencial-ficticia', 'conteúdo com acentuação 🔒', ''])(
    'recupera conteúdo UTF-8 somente após autenticação da cifra (%s)',
    (conteudo) => {
      const cifrado = servico.criptografar(conteudo);
      expect(servico.descriptografar(cifrado)).toBe(conteudo);
      expect(cifrado).toMatch(/^v1:[0-9a-f]{24}:[0-9a-f]{32}:[0-9a-f]*$/);
      if (conteudo) expect(cifrado).not.toContain(conteudo);
    },
  );

  it('usa nonce aleatório novo e preserva tag de autenticação', () => {
    const primeiro = servico.criptografar('credencial-ficticia');
    const segundo = servico.criptografar('credencial-ficticia');
    expect(primeiro).not.toBe(segundo);
    expect(primeiro.split(':')[1]).not.toBe(segundo.split(':')[1]);
    expect(Buffer.from(primeiro.split(':')[1], 'hex')).toHaveLength(12);
    expect(Buffer.from(primeiro.split(':')[2], 'hex')).toHaveLength(16);
  });

  it.each([1, 2, 3])(
    'rejeita adulteração de nonce, tag ou conteúdo (parte %i)',
    (indice) => {
      const partes = servico.criptografar('credencial-ficticia').split(':');
      partes[indice] =
        (partes[indice][0] === '0' ? '1' : '0') + partes[indice].slice(1);
      expect(() => servico.descriptografar(partes.join(':'))).toThrow(
        'Não foi possível descriptografar a credencial.',
      );
    },
  );

  it('rejeita chave incorreta sem expor conteúdo ou detalhes criptográficos', () => {
    const cifrado = servico.criptografar('credencial-ficticia');
    const outroServico = new CriptografiaService(
      configurar(randomBytes(32).toString('hex')),
    );
    expect(() => outroServico.descriptografar(cifrado)).toThrow(
      new Error('Não foi possível descriptografar a credencial.'),
    );
  });

  it.each([
    '',
    'texto-sem-envelope',
    'v2:00:00:00',
    'v1:00:00:00',
    `v1:${'0'.repeat(24)}:${'0'.repeat(32)}:a`,
  ])('rejeita formato inválido ou incompleto (%s)', (cifrado) => {
    expect(() => servico.descriptografar(cifrado)).toThrow(
      'Não foi possível descriptografar a credencial.',
    );
  });

  it.each([
    undefined,
    '',
    'a'.repeat(63),
    'a'.repeat(65),
    'g'.repeat(64),
    ' '.repeat(64),
  ])('rejeita chave ausente ou fora do formato na inicialização', (valor) => {
    expect(() => new CriptografiaService(configurar(valor))).toThrow(
      'GATEWAY_ENCRYPTION_KEY',
    );
  });

  it('rejeita reutilização do segredo JWT como chave mestra', () => {
    expect(() => new CriptografiaService(configurar(chave, chave))).toThrow(
      'independente',
    );
    const segredo = 's'.repeat(32);
    expect(
      () =>
        new CriptografiaService(
          configurar(Buffer.from(segredo).toString('hex'), segredo),
        ),
    ).toThrow('independente');
  });

  it('inicializa pelo módulo com configuração válida sem conexão com banco', async () => {
    const modulo = await Test.createTestingModule({
      imports: [ContasGatewayModule],
    })
      .overrideProvider(ConfigService)
      .useValue(configurar(chave))
      .overrideProvider(getRepositoryToken(ContaGateway))
      .useValue({})
      .compile();
    try {
      const criptografia = modulo.get(CriptografiaService);
      expect(
        criptografia.descriptografar(
          criptografia.criptografar('credencial-ficticia'),
        ),
      ).toBe('credencial-ficticia');
    } finally {
      await modulo.close();
    }
  });

  it('impede a inicialização do módulo sem chave configurada', async () => {
    await expect(
      Test.createTestingModule({ imports: [ContasGatewayModule] })
        .overrideProvider(ConfigService)
        .useValue(configurar(undefined))
        .overrideProvider(getRepositoryToken(ContaGateway))
        .useValue({})
        .compile(),
    ).rejects.toThrow('GATEWAY_ENCRYPTION_KEY');
  });
});
