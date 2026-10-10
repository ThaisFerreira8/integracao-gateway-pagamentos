import { instanceToPlain } from 'class-transformer';
import { DataSource } from 'typeorm';
import { Usuario } from '../usuarios/entities/usuario.entity';
import { ContaGateway } from './entities/conta-gateway.entity';

class FonteTeste extends DataSource {
  prepararMetadados(): Promise<void> {
    return this.buildMetadatas();
  }
}

describe('ContaGateway', () => {
  let fonte: FonteTeste;

  beforeAll(async () => {
    fonte = new FonteTeste({
      type: 'mysql',
      database: 'teste_metadados',
      entities: [Usuario, ContaGateway],
    });
    await fonte.prepararMetadados();
  });

  it('exige proprietário e limita o vínculo a uma conta por usuário', () => {
    const metadados = fonte.getMetadata(ContaGateway);
    const relacionamento = metadados.relations.find(
      (relacao) => relacao.propertyName === 'usuario',
    );
    expect(relacionamento?.isOneToOneOwner).toBe(true);
    expect(relacionamento?.isNullable).toBe(false);
    expect(relacionamento?.onDelete).toBe('RESTRICT');
    expect(
      relacionamento?.joinColumns.map((coluna) => coluna.databaseName),
    ).toEqual(['usuario_id']);
    expect(
      metadados.indices.some(
        (indice) =>
          indice.isUnique &&
          indice.columns.some((coluna) => coluna.databaseName === 'usuario_id'),
      ),
    ).toBe(true);
    expect(
      metadados.indices.some(
        (indice) =>
          indice.isUnique &&
          indice.columns.some(
            (coluna) => coluna.propertyName === 'identificadorGateway',
          ),
      ),
    ).toBe(true);
  });

  it('omite credenciais tanto na consulta direta quanto com relacionamento', () => {
    const consulta = fonte
      .getRepository(ContaGateway)
      .createQueryBuilder('conta')
      .getSql();
    const consultaRelacionada = fonte
      .getRepository(Usuario)
      .createQueryBuilder('usuario')
      .leftJoinAndSelect('usuario.contaGateway', 'conta')
      .getSql();
    for (const campo of [
      'codigo_cliente',
      'token_criptografado',
      'chave_loja_criptografada',
    ]) {
      expect(consulta).not.toContain(campo);
      expect(consultaRelacionada).not.toContain(campo);
    }
  });

  it('exclui credenciais da serialização inclusive em uma conta vinculada', () => {
    const conta = Object.assign(new ContaGateway(), {
      identificadorGateway: 'identificador-ficticio',
      codigoCliente: 123,
      tokenCriptografado: 'token-ficticio',
      chaveLojaCriptografada: 'chave-ficticia',
    });
    const usuario = Object.assign(new Usuario(), { contaGateway: conta });
    expect(instanceToPlain(usuario)).toEqual({
      contaGateway: { identificadorGateway: 'identificador-ficticio' },
    });
  });
});
