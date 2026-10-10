import { NotFoundException, ValidationPipe } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { DataSource, Repository, type SelectQueryBuilder } from 'typeorm';
import { CHAVE_ROTA_PUBLICA } from '../autenticacao/decoradores/rota-publica.decorator';
import type { RequisicaoAutenticada } from '../autenticacao/guards/autenticacao.guard';
import { LinkCheckout } from '../checkouts/entities/link-checkout.entity';
import { ContaGateway } from '../contas-gateway/entities/conta-gateway.entity';
import { EstadoPedido, Pedido } from '../pedidos/entities/pedido.entity';
import {
  EstadoTransacao,
  Transacao,
} from '../transacoes/entities/transacao.entity';
import { Usuario } from '../usuarios/entities/usuario.entity';
import {
  ConsultarPagamentosDto,
  ConsultarReferenciaPagamentoDto,
} from './dtos/consultar-pagamentos.dto';
import { PagamentosController } from './pagamentos.controller';
import { PagamentosService } from './pagamentos.service';

class FonteSemConexao extends DataSource {
  prepararMetadados() {
    return this.buildMetadatas();
  }
}

describe('Consultas locais de pagamentos', () => {
  const usuarioId = randomUUID();
  const outroUsuarioId = randomUUID();
  const pedido = {
    id: randomUUID(),
    referenciaExterna: 'PEDIDO-TESTE',
    estado: EstadoPedido.PENDENTE,
    criadoEm: new Date(),
    atualizadoEm: new Date(),
    linkCheckout: {
      id: randomUUID(),
      usuarioId,
      identificadorPublico: randomUUID(),
      valorCentavos: 15000,
      metodo: 'PIX',
      estado: 'ATIVO',
    },
    senhaHash: 'NAO-EXIBIR',
    token: 'NAO-EXIBIR',
  } as unknown as Pedido;
  const transacao = {
    id: randomUUID(),
    usuarioId,
    pedidoId: pedido.id,
    tipo: 'PIX',
    estado: EstadoTransacao.EXPIRADA,
    valorCentavos: 15000,
    taxaCentavos: null,
    valorLiquidoCentavos: null,
    criadoEm: new Date(),
    numeroCartao: 'NAO-EXIBIR',
    chaveLoja: 'NAO-EXIBIR',
  } as unknown as Transacao;
  const transacoes = { find: jest.fn() };
  const pipe = new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
  });
  let fonte: FonteSemConexao;
  let repositorio: Repository<Pedido>;
  let servico: PagamentosService;
  let buscas: SelectQueryBuilder<Pedido>[];

  beforeAll(async () => {
    // Gera SQL com os metadados reais; a execução permanece simulada, sem abrir conexão.
    fonte = new FonteSemConexao({
      type: 'mysql',
      database: 'teste_sem_conexao',
      entities: [Pedido, LinkCheckout, Transacao, Usuario, ContaGateway],
    });
    await fonte.prepararMetadados();
    repositorio = fonte.getRepository(Pedido);
    const criarBusca = repositorio.createQueryBuilder.bind(repositorio);
    jest
      .spyOn(repositorio, 'createQueryBuilder')
      .mockImplementation((alias) => {
        const busca = criarBusca(alias);
        jest.spyOn(busca, 'getManyAndCount').mockResolvedValue([[pedido], 1]);
        jest.spyOn(busca, 'getOne').mockImplementation(async () => {
          const parametros = busca.getParameters();
          return parametros.usuarioId === usuarioId &&
            (parametros.id === pedido.id ||
              parametros.referenciaExterna === pedido.referenciaExterna)
            ? pedido
            : null;
        });
        buscas.push(busca);
        return busca;
      });
    servico = new PagamentosService(
      repositorio,
      transacoes as unknown as Repository<Transacao>,
    );
  });

  beforeEach(() => {
    buscas = [];
    transacoes.find.mockReset().mockResolvedValue([transacao]);
  });

  it('lista com propriedade pelo link, paginação estável e resposta sem campos sensíveis', async () => {
    const resultado = await servico.listar(
      usuarioId,
      Object.assign(new ConsultarPagamentosDto(), { pagina: 2, limite: 10 }),
    );
    const [sql, parametros] = buscas[0].getQueryAndParameters();
    expect(sql).toContain('INNER JOIN `links_checkout`');
    expect(sql).toContain('WHERE `link`.`usuario_id` = ?');
    expect(parametros).toContain(usuarioId);
    expect(buscas[0].expressionMap.skip).toBe(10);
    expect(buscas[0].expressionMap.take).toBe(10);
    expect(sql).toContain(
      'ORDER BY `pedido_criado_em` DESC, `pedido_id` DESC',
    );
    expect(resultado).toMatchObject({
      pagina: 2,
      limite: 10,
      total: 1,
      totalPaginas: 1,
    });
    expect(resultado.dados[0]).toMatchObject({
      id: pedido.id,
      referenciaExterna: pedido.referenciaExterna,
      estadoPedido: 'PENDENTE',
      transacoes: [{ estado: 'EXPIRADA', taxaCentavos: null }],
    });
    expect(JSON.stringify(resultado)).not.toContain('NAO-EXIBIR');
    expect(JSON.stringify(resultado)).not.toContain(usuarioId);
    const consultaTransacoes = transacoes.find.mock.calls[0][0];
    expect(consultaTransacoes.where.usuarioId).toBe(usuarioId);
    expect(consultaTransacoes.where.pedidoId.value).toEqual([pedido.id]);
    expect(consultaTransacoes.where.tipo.value).toEqual(['PIX', 'CARTAO']);
    expect(fonte.isInitialized).toBe(false);
  });

  it.each([
    ['APPROVED', EstadoTransacao.APROVADA, EstadoPedido.APROVADO],
    ['DENIED', EstadoTransacao.NEGADA, EstadoPedido.NEGADO],
    ['EXPIRED', EstadoTransacao.EXPIRADA, undefined],
    ['CANCELLED', EstadoTransacao.CANCELADA, undefined],
  ] as const)(
    'filtra %s sem atribuir estados inexistentes ao pedido',
    async (status, estadoTransacao, estadoPedido) => {
      await servico.listar(
        usuarioId,
        Object.assign(new ConsultarPagamentosDto(), { status }),
      );
      const busca = buscas[0];
      const sql = busca.getQuery();
      expect(busca.getParameters()).toMatchObject({
        usuarioId,
        estadoTransacao,
        estadoPedido,
      });
      expect(sql).toContain(
        'WHERE `link`.`usuario_id` = :usuarioId AND (EXISTS',
      );
      expect(sql).toContain('`transacaoFiltro`.`pedido_id` = `pedido`.`id`');
      expect(sql).toContain('`transacaoFiltro`.`usuario_id` = :usuarioId');
      expect(sql).toContain('`transacaoFiltro`.`tipo` IN (:...tiposPagamento)');
      expect(sql.includes('OR `pedido`.`estado` = :estadoPedido')).toBe(
        estadoPedido !== undefined,
      );
      expect(sql).not.toContain('`link`.`estado` =');
      expect(sql).not.toContain('`link`.`expira_em`');
    },
  );

  it('usa parâmetro na referência externa, sem interpolar conteúdo recebido', async () => {
    const referenciaExterna = "' OR 1=1 --";
    await servico.listar(
      usuarioId,
      Object.assign(new ConsultarPagamentosDto(), {
        referenciaExterna,
        status: 'APPROVED',
      }),
    );
    expect(buscas[0].getQuery()).toContain(
      '`pedido`.`referencia_externa` = :referenciaExterna',
    );
    expect(buscas[0].getQuery()).not.toContain(referenciaExterna);
    expect(buscas[0].getParameters().referenciaExterna).toBe(referenciaExterna);
  });

  it('consulta individual restringe simultaneamente proprietário e UUID local', async () => {
    expect((await servico.consultar(usuarioId, pedido.id)).id).toBe(pedido.id);
    expect(buscas[0].getQuery()).toContain(
      'WHERE `link`.`usuario_id` = :usuarioId AND `pedido`.`id` = :id',
    );
  });

  it.each([outroUsuarioId, randomUUID()])(
    'não revela pedido de outro lojista: %s',
    async (proprietario) => {
      await expect(
        servico.consultar(proprietario, pedido.id),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(transacoes.find).not.toHaveBeenCalled();
    },
  );

  it('pedido ausente retorna a mesma resposta de pedido alheio', async () => {
    await expect(
      servico.consultar(usuarioId, randomUUID()),
    ).rejects.toMatchObject({ message: 'Pedido não encontrado.' });
    await expect(
      servico.consultar(outroUsuarioId, pedido.id),
    ).rejects.toMatchObject({ message: 'Pedido não encontrado.' });
  });

  it('busca referência externa local com isolamento pelo link', async () => {
    expect(
      (await servico.consultarReferencia(usuarioId, pedido.referenciaExterna))
        .id,
    ).toBe(pedido.id);
    await expect(
      servico.consultarReferencia(outroUsuarioId, pedido.referenciaExterna),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('usa paginação padrão e não consulta transações quando a página está vazia', async () => {
    const consulta = (await pipe.transform(
      {},
      { type: 'query', metatype: ConsultarPagamentosDto },
    )) as ConsultarPagamentosDto;
    const original = repositorio.createQueryBuilder;
    const criarBuscaVazia = jest
      .spyOn(repositorio, 'createQueryBuilder')
      .mockImplementationOnce((alias) => {
        const busca = original.call(repositorio, alias);
        jest.mocked(busca.getManyAndCount).mockResolvedValueOnce([[], 0]);
        return busca;
      });
    expect(await servico.listar(usuarioId, consulta)).toEqual({
      dados: [],
      pagina: 1,
      limite: 20,
      total: 0,
      totalPaginas: 0,
    });
    expect(transacoes.find).not.toHaveBeenCalled();
    expect(criarBuscaVazia).toHaveBeenCalled();
  });

  it('controller utiliza o usuário autenticado em todas as consultas', async () => {
    const controller = new PagamentosController(servico);
    const requisicao = {
      usuarioAutenticado: { id: usuarioId },
      query: { usuarioId: outroUsuarioId },
    } as unknown as RequisicaoAutenticada;
    await controller.listar(requisicao, new ConsultarPagamentosDto());
    await controller.consultar(requisicao, pedido.id);
    await controller.consultarReferencia(requisicao, {
      referenciaExterna: pedido.referenciaExterna,
    });
    expect(
      buscas.every((busca) => busca.getParameters().usuarioId === usuarioId),
    ).toBe(true);
    expect(
      Reflect.getMetadata(CHAVE_ROTA_PUBLICA, PagamentosController),
    ).toBeUndefined();
  });

  it('converte paginação decimal válida e preserva o filtro confirmado', async () => {
    expect(
      await pipe.transform(
        { pagina: '2', limite: '50', status: 'CANCELLED' },
        { type: 'query', metatype: ConsultarPagamentosDto },
      ),
    ).toMatchObject({ pagina: 2, limite: 50, status: 'CANCELLED' });
  });

  it.each([
    { pagina: '0' },
    { pagina: '1.5' },
    { pagina: '1e2' },
    { pagina: '' },
    { pagina: '100001' },
    { limite: '0' },
    { limite: '101' },
    { limite: '-1' },
    { limite: 'abc' },
    { status: 'SUCESSO' },
    { usuarioId: outroUsuarioId },
    { referenciaExterna: ' ' },
  ])(
    'rejeita consulta inválida ou identidade enviada pelo cliente: %j',
    async (consulta) => {
      await expect(
        pipe.transform(consulta, {
          type: 'query',
          metatype: ConsultarPagamentosDto,
        }),
      ).rejects.toMatchObject({ status: 400 });
    },
  );

  it('busca individual por referência exige referência e rejeita campos extras', async () => {
    await expect(
      pipe.transform(
        {},
        { type: 'query', metatype: ConsultarReferenciaPagamentoDto },
      ),
    ).rejects.toMatchObject({ status: 400 });
    await expect(
      pipe.transform(
        { referenciaExterna: pedido.referenciaExterna, usuarioId },
        { type: 'query', metatype: ConsultarReferenciaPagamentoDto },
      ),
    ).rejects.toMatchObject({ status: 400 });
  });
});
