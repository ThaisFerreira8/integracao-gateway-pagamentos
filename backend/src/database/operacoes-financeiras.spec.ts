import { instanceToPlain } from 'class-transformer';
import { DataSource } from 'typeorm';
import { LinkCheckout } from '../checkouts/entities/link-checkout.entity';
import { ContaGateway } from '../contas-gateway/entities/conta-gateway.entity';
import { Pedido } from '../pedidos/entities/pedido.entity';
import { Saque } from '../saques/entities/saque.entity';
import { Transacao } from '../transacoes/entities/transacao.entity';
import { Usuario } from '../usuarios/entities/usuario.entity';
import {
  EventoWebhook,
  EstadoProcessamentoWebhook,
} from '../webhooks/entities/evento-webhook.entity';

class FonteTeste extends DataSource {
  prepararMetadados(): Promise<void> {
    return this.buildMetadatas();
  }
}

describe('Modelagem das operações financeiras', () => {
  let fonte: FonteTeste;

  beforeAll(async () => {
    // Valida todos os relacionamentos sem conexão ou alterações no MySQL.
    fonte = new FonteTeste({
      type: 'mysql',
      database: 'teste_metadados',
      entities: [
        Usuario,
        ContaGateway,
        LinkCheckout,
        Pedido,
        Transacao,
        Saque,
        EventoWebhook,
      ],
    });
    await fonte.prepararMetadados();
  });

  it.each([Transacao, Saque])(
    'exige proprietário e preserva registros financeiros (%p)',
    (entidade) => {
      const relacao = fonte
        .getMetadata(entidade)
        .relations.find((item) => item.propertyName === 'usuario');
      expect(relacao?.isNullable).toBe(false);
      expect(relacao?.onDelete).toBe('RESTRICT');
      expect(relacao?.joinColumns.map((coluna) => coluna.databaseName)).toEqual(
        ['usuario_id'],
      );
      expect(
        fonte
          .getMetadata(entidade)
          .indices.some(
            (indice) =>
              indice.isUnique &&
              indice.columns.map((coluna) => coluna.propertyName).join(',') ===
                'usuarioId,identificadorGateway',
          ),
      ).toBe(true);
    },
  );

  it('armazena valores em centavos e distingue valores desconhecidos de zero', () => {
    for (const entidade of [Transacao, Saque]) {
      const valor = fonte
        .getMetadata(entidade)
        .findColumnWithPropertyName('valorCentavos');
      expect(valor?.type).toBe('int');
      expect(valor?.unsigned).toBe(true);
      expect(valor?.isNullable).toBe(false);
      expect(
        fonte
          .getMetadata(entidade)
          .findColumnWithPropertyName('identificadorGateway')?.isNullable,
      ).toBe(true);
    }
    for (const propriedade of ['taxaCentavos', 'valorLiquidoCentavos']) {
      const coluna = fonte
        .getMetadata(Transacao)
        .findColumnWithPropertyName(propriedade);
      expect(coluna?.type).toBe('int');
      expect(coluna?.unsigned).toBe(true);
      expect(coluna?.isNullable).toBe(true);
    }
    expect(
      fonte
        .getMetadata(Transacao)
        .relations.find((relacao) => relacao.propertyName === 'pedido')
        ?.isNullable,
    ).toBe(true);
  });

  it('reserva referência única para cada solicitação de saque', () => {
    expect(
      fonte
        .getMetadata(Saque)
        .indices.some(
          (indice) =>
            indice.isUnique &&
            indice.columns.some(
              (coluna) => coluna.propertyName === 'referenciaExterna',
            ),
        ),
    ).toBe(true);
  });

  it('restringe duplicidade de eventos à conta proprietária', () => {
    const metadados = fonte.getMetadata(EventoWebhook);
    expect(
      metadados.indices.some(
        (indice) =>
          indice.isUnique &&
          indice.columns.map((coluna) => coluna.propertyName).join(',') ===
            'contaGatewayId,chaveDeduplicacao',
      ),
    ).toBe(true);
    expect(
      metadados.findColumnWithPropertyName('chaveDeduplicacao')?.isNullable,
    ).toBe(false);
    expect(
      metadados.relations.find(
        (relacao) => relacao.propertyName === 'contaGateway',
      )?.isNullable,
    ).toBe(false);
    expect(metadados.findColumnWithPropertyName('estado')?.default).toBe(
      EstadoProcessamentoWebhook.PENDENTE,
    );
    expect(
      metadados.findColumnWithPropertyName('processadoEm')?.isNullable,
    ).toBe(true);
  });

  it('omite dados do destinatário e payload nas consultas padrão, permitindo seleção explícita', () => {
    const consultaSaque = fonte
      .getRepository(Saque)
      .createQueryBuilder('saque');
    expect(consultaSaque.getSql()).not.toContain('chave_pix');
    expect(consultaSaque.getSql()).not.toContain('documento_titular');
    expect(
      consultaSaque
        .addSelect(['saque.chavePix', 'saque.documentoTitular'])
        .getSql(),
    ).toContain('documento_titular');
    const consultaEvento = fonte
      .getRepository(EventoWebhook)
      .createQueryBuilder('evento');
    expect(consultaEvento.getSql()).not.toContain('payload');
    expect(consultaEvento.addSelect('evento.payload').getSql()).toContain(
      'payload',
    );
  });

  it('exclui dados sensíveis da serialização mesmo após seleção explícita', () => {
    const saque = Object.assign(new Saque(), {
      valorCentavos: 100,
      chavePix: 'chave-ficticia',
      documentoTitular: 'documento-ficticio',
    });
    const evento = Object.assign(new EventoWebhook(), {
      estado: EstadoProcessamentoWebhook.PENDENTE,
      payload: { dado: 'conteudo-ficticio' },
    });
    expect(instanceToPlain(saque)).toEqual({ valorCentavos: 100 });
    expect(instanceToPlain(evento)).toEqual({
      estado: EstadoProcessamentoWebhook.PENDENTE,
    });
  });
});
