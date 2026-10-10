import { DataSource } from 'typeorm';
import { LinkCheckout } from '../checkouts/entities/link-checkout.entity';
import { ContaGateway } from '../contas-gateway/entities/conta-gateway.entity';
import { Usuario } from '../usuarios/entities/usuario.entity';
import { EstadoPedido, Pedido } from './entities/pedido.entity';

class FonteTeste extends DataSource {
  prepararMetadados(): Promise<void> {
    return this.buildMetadatas();
  }
}

describe('Pedido', () => {
  let fonte: FonteTeste;

  beforeAll(async () => {
    fonte = new FonteTeste({
      type: 'mysql',
      database: 'teste_metadados',
      entities: [Usuario, ContaGateway, LinkCheckout, Pedido],
    });
    await fonte.prepararMetadados();
  });

  it('exige um link e impede mais de um pedido por link', () => {
    const metadados = fonte.getMetadata(Pedido);
    const relacionamento = metadados.relations.find(
      (relacao) => relacao.propertyName === 'linkCheckout',
    );
    expect(relacionamento?.isOneToOneOwner).toBe(true);
    expect(relacionamento?.isNullable).toBe(false);
    expect(relacionamento?.onDelete).toBe('RESTRICT');
    expect(
      relacionamento?.joinColumns.map((coluna) => coluna.databaseName),
    ).toEqual(['link_checkout_id']);
    expect(
      metadados.indices.some(
        (indice) =>
          indice.isUnique &&
          indice.columns.some(
            (coluna) => coluna.databaseName === 'link_checkout_id',
          ),
      ),
    ).toBe(true);
  });

  it('reserva referências únicas para conciliação sem exigir pagamento já criado', () => {
    const metadados = fonte.getMetadata(Pedido);
    for (const propriedade of [
      'referenciaExterna',
      'identificadorPagamentoGateway',
    ]) {
      expect(
        metadados.indices.some(
          (indice) =>
            indice.isUnique &&
            indice.columns.some(
              (coluna) => coluna.propertyName === propriedade,
            ),
        ),
      ).toBe(true);
    }
    expect(
      metadados.findColumnWithPropertyName('referenciaExterna')?.isNullable,
    ).toBe(false);
    expect(
      metadados.findColumnWithPropertyName('identificadorPagamentoGateway')
        ?.isNullable,
    ).toBe(true);
  });

  it('inicia pendente e permite consulta do proprietário pelo link', () => {
    expect(
      fonte.getMetadata(Pedido).findColumnWithPropertyName('estado')?.default,
    ).toBe(EstadoPedido.PENDENTE);
    const consulta = fonte
      .getRepository(Pedido)
      .createQueryBuilder('pedido')
      .innerJoin('pedido.linkCheckout', 'link')
      .where('link.usuarioId = :usuarioId', { usuarioId: 'usuario-ficticio' });
    expect(consulta.getSql()).toContain('usuario_id');
    expect(consulta.getParameters()).toEqual({ usuarioId: 'usuario-ficticio' });
  });
});
