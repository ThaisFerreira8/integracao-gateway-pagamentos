import { DataSource } from 'typeorm';
import { ContaGateway } from '../contas-gateway/entities/conta-gateway.entity';
import { Pedido } from '../pedidos/entities/pedido.entity';
import { Usuario } from '../usuarios/entities/usuario.entity';
import {
  EstadoLinkCheckout,
  LinkCheckout,
} from './entities/link-checkout.entity';

class FonteTeste extends DataSource {
  prepararMetadados(): Promise<void> {
    return this.buildMetadatas();
  }
}

describe('LinkCheckout', () => {
  let fonte: FonteTeste;

  beforeAll(async () => {
    // Valida o mapeamento MySQL sem conexão ou alterações no banco.
    fonte = new FonteTeste({
      type: 'mysql',
      database: 'teste_metadados',
      entities: [Usuario, ContaGateway, LinkCheckout, Pedido],
    });
    await fonte.prepararMetadados();
  });

  it('exige proprietário e identificador público único', () => {
    const metadados = fonte.getMetadata(LinkCheckout);
    const relacionamento = metadados.relations.find(
      (relacao) => relacao.propertyName === 'usuario',
    );
    expect(relacionamento?.isNullable).toBe(false);
    expect(relacionamento?.onDelete).toBe('RESTRICT');
    expect(
      relacionamento?.joinColumns.map((coluna) => coluna.databaseName),
    ).toEqual(['usuario_id']);
    expect(
      metadados.indices.some(
        (indice) =>
          indice.isUnique &&
          indice.columns.some(
            (coluna) => coluna.propertyName === 'identificadorPublico',
          ),
      ),
    ).toBe(true);
  });

  it('armazena centavos como inteiro e percentual como decimal sem transformação para ponto flutuante', () => {
    const metadados = fonte.getMetadata(LinkCheckout);
    const valor = metadados.findColumnWithPropertyName('valorCentavos');
    const taxa = metadados.findColumnWithPropertyName('taxaAplicadaPercentual');
    expect(valor?.type).toBe('int');
    expect(valor?.unsigned).toBe(true);
    expect(valor?.isNullable).toBe(false);
    expect(taxa?.type).toBe('decimal');
    expect(taxa?.precision).toBe(7);
    expect(taxa?.scale).toBe(4);
    expect(taxa?.transformer).toBeUndefined();
    expect(taxa?.isNullable).toBe(true);
    expect(metadados.findColumnWithPropertyName('parcelas')?.isNullable).toBe(
      true,
    );
  });

  it('mantém expiração obrigatória e estado local independente do pedido', () => {
    const metadados = fonte.getMetadata(LinkCheckout);
    expect(metadados.findColumnWithPropertyName('expiraEm')?.isNullable).toBe(
      false,
    );
    expect(metadados.findColumnWithPropertyName('estado')?.default).toBe(
      EstadoLinkCheckout.ATIVO,
    );
    expect(metadados.findColumnWithPropertyName('estado')?.enum).toContain(
      EstadoLinkCheckout.EXPIRADO,
    );
    expect(
      metadados.relations.find((relacao) => relacao.propertyName === 'pedido')
        ?.isOneToOneNotOwner,
    ).toBe(true);
  });
});
