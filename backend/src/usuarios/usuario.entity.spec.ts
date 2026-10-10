import { instanceToPlain } from 'class-transformer';
import { DataSource } from 'typeorm';
import { ContaGateway } from '../contas-gateway/entities/conta-gateway.entity';
import { Usuario } from './entities/usuario.entity';

class FonteTeste extends DataSource {
  prepararMetadados(): Promise<void> {
    return this.buildMetadatas();
  }
}

describe('Usuario', () => {
  let fonte: FonteTeste;

  beforeAll(async () => {
    // Constrói o mapeamento MySQL sem abrir conexão ou criar tabelas.
    fonte = new FonteTeste({
      type: 'mysql',
      database: 'teste_metadados',
      entities: [Usuario, ContaGateway],
    });
    await fonte.prepararMetadados();
  });

  it('mapeia identificador gerado e unicidade do e-mail', () => {
    const metadados = fonte.getMetadata(Usuario);
    expect(metadados.tableName).toBe('usuarios');
    expect(metadados.primaryColumns[0].generationStrategy).toBe('uuid');
    expect(
      metadados.indices.some(
        (indice) =>
          indice.isUnique &&
          indice.columns.some((coluna) => coluna.propertyName === 'email'),
      ),
    ).toBe(true);
  });

  it('omite a senha das consultas padrão e permite seleção explícita para autenticação', () => {
    const consulta = fonte.getRepository(Usuario).createQueryBuilder('usuario');
    expect(consulta.getSql()).not.toContain('senha_hash');
    expect(consulta.addSelect('usuario.senhaHash').getSql()).toContain(
      'senha_hash',
    );
  });

  it('exclui a senha da serialização mesmo quando foi carregada', () => {
    const usuario = Object.assign(new Usuario(), {
      nome: 'Lojista de teste',
      senhaHash: 'hash-ficticio',
    });
    expect(instanceToPlain(usuario)).toEqual({ nome: 'Lojista de teste' });
  });
});
