import { DataSource, Table, TableForeignKey, type QueryRunner } from 'typeorm';
import fonteConfigurada from './data-source';
import { CriarEstruturaInicial1791597427065 } from './migrations/1791597427065-criar-estrutura-inicial';

class FonteTeste extends DataSource {
  prepararMetadados(): Promise<void> {
    return this.buildMetadatas();
  }
}

type GeradorSql = {
  createTableSql(tabela: Table, criarChaves: boolean): { query: string };
  dropTableSql(tabela: Table): { query: string };
  createForeignKeySql(tabela: Table, chave: TableForeignKey): { query: string };
  dropForeignKeySql(tabela: Table, chave: TableForeignKey): { query: string };
};

describe('Migration da estrutura inicial', () => {
  let fonte: FonteTeste;

  beforeAll(async () => {
    // Carrega os caminhos reais da CLI, sem inicializar conexão ou executar SQL.
    fonte = new FonteTeste(fonteConfigurada.options);
    await fonte.prepararMetadados();
  });

  const normalizar = (sql: string) =>
    sql.replace(/\s+/g, ' ').replace(/\s+\)/g, ')').trim();

  const gerarSqlEsperado = () => {
    const gerador = fonte.createQueryRunner() as unknown as GeradorSql;
    const entidades = fonte.entityMetadatas.filter(
      (entidade) => entidade.tableType === 'regular',
    );
    const tabelas = entidades.map((entidade) =>
      Table.create(entidade, fonte.driver),
    );
    const criarTabelas = tabelas.map(
      (tabela) => gerador.createTableSql(tabela, false).query,
    );
    const removerTabelas = tabelas.map(
      (tabela) => gerador.dropTableSql(tabela).query,
    );
    const criarChaves: string[] = [];
    const removerChaves: string[] = [];

    entidades.forEach((entidade, indice) => {
      for (const metadados of entidade.foreignKeys) {
        const chave = TableForeignKey.create(metadados, fonte.driver);
        criarChaves.push(
          gerador.createForeignKeySql(tabelas[indice], chave).query,
        );
        removerChaves.push(
          gerador.dropForeignKeySql(tabelas[indice], chave).query,
        );
      }
    });

    return {
      criacao: [...criarTabelas, ...criarChaves].map(normalizar),
      reversao: [...removerChaves.reverse(), ...removerTabelas.reverse()].map(
        normalizar,
      ),
    };
  };

  it('descobre a migration e as sete entidades com a configuração real da CLI', () => {
    expect(fonte.isInitialized).toBe(false);
    expect(fonte.options.synchronize).toBe(false);
    expect(fonte.options.migrationsRun).not.toBe(true);
    expect(
      fonte.migrations.some(
        (migration) => migration instanceof CriarEstruturaInicial1791597427065,
      ),
    ).toBe(true);
    expect(
      fonte.entityMetadatas.map((entidade) => entidade.tableName).sort(),
    ).toEqual(
      [
        'usuarios',
        'contas_gateway',
        'links_checkout',
        'pedidos',
        'transacoes',
        'saques',
        'eventos_webhook',
      ].sort(),
    );
  });

  it('cria tabelas e depois chaves estrangeiras com SQL compatível com as entidades', async () => {
    const consultas = jest.fn().mockResolvedValue(undefined);
    const executor = { query: consultas } as unknown as QueryRunner;
    await new CriarEstruturaInicial1791597427065().up(executor);

    const executadas = consultas.mock.calls.map(([sql]: [string]) =>
      normalizar(sql),
    );
    expect(executadas).toEqual(gerarSqlEsperado().criacao);
    expect(
      executadas.slice(0, 7).every((sql) => sql.startsWith('CREATE TABLE')),
    ).toBe(true);
    expect(
      executadas
        .slice(7)
        .every(
          (sql) => sql.startsWith('ALTER TABLE') && sql.includes('FOREIGN KEY'),
        ),
    ).toBe(true);
  });

  it('remove relacionamentos antes das tabelas e reverte todas as operações', async () => {
    const consultas = jest.fn().mockResolvedValue(undefined);
    const executor = { query: consultas } as unknown as QueryRunner;
    await new CriarEstruturaInicial1791597427065().down(executor);

    const executadas = consultas.mock.calls.map(([sql]: [string]) =>
      normalizar(sql),
    );
    expect(executadas).toEqual(gerarSqlEsperado().reversao);
    expect(
      executadas.slice(0, 7).every((sql) => sql.includes('DROP FOREIGN KEY')),
    ).toBe(true);
    expect(
      executadas.slice(7).every((sql) => sql.startsWith('DROP TABLE')),
    ).toBe(true);
  });
});
