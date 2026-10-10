import { useEffect, useState, type FormEvent } from "react";
import {
  listarPedidos,
  type FiltroPagamento,
  type PaginaPedidos,
} from "../servicos/api";

const moeda = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
});
const estados = [
  { valor: "APPROVED", nome: "Aprovados" },
  { valor: "DENIED", nome: "Negados" },
  { valor: "EXPIRED", nome: "Expirados" },
  { valor: "CANCELLED", nome: "Cancelados" },
] as const;

export default function Transacoes() {
  const [consulta, definirConsulta] = useState<{
    pagina: number;
    limite: number;
    status?: FiltroPagamento;
    referenciaExterna?: string;
  }>({ pagina: 1, limite: 20 });
  const [status, definirStatus] = useState<FiltroPagamento | "">("");
  const [referencia, definirReferencia] = useState("");
  const [limite, definirLimite] = useState(20);
  const [resultado, definirResultado] = useState<PaginaPedidos | null>(null);
  const [erro, definirErro] = useState("");
  const [revisao, definirRevisao] = useState(0);

  useEffect(() => {
    let atual = true;
    listarPedidos(consulta)
      .then((retorno) => {
        if (atual) definirResultado(retorno);
      })
      .catch((falha: unknown) => {
        if (atual)
          definirErro(
            falha instanceof Error
              ? falha.message
              : "Não foi possível consultar os pedidos.",
          );
      });
    return () => {
      atual = false;
    };
  }, [consulta, revisao]);

  const carregando = resultado === null && !erro;
  function buscar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    definirErro("");
    definirResultado(null);
    definirConsulta({
      pagina: 1,
      limite,
      ...(status ? { status } : {}),
      ...(referencia.trim() ? { referenciaExterna: referencia.trim() } : {}),
    });
  }
  function paginar(pagina: number) {
    definirErro("");
    definirResultado(null);
    definirConsulta({ ...consulta, pagina });
  }
  function atualizar() {
    definirErro("");
    definirResultado(null);
    definirRevisao((anterior) => anterior + 1);
  }

  return (
    <div className="pagamentos-conteudo">
      <p className="aviso-pagamentos">
        Esta consulta apresenta pedidos e transações locais. A conciliação
        externa está disponível pela API privada de checkouts. Expirados e
        cancelados consideram somente transações locais com esses estados, não a
        expiração do link.
      </p>
      <section className="painel-pagamentos" aria-labelledby="titulo-filtros">
        <div className="titulo-painel">
          <h2 id="titulo-filtros">Consultar pedidos</h2>
          <span className="etiqueta-informativa">Registros locais</span>
        </div>
        <form onSubmit={buscar}>
          <fieldset disabled={carregando}>
            <div className="grade-formulario">
              <div className="campo">
                <label htmlFor="referencia-pedido">
                  Referência externa exata
                </label>
                <input
                  id="referencia-pedido"
                  value={referencia}
                  onChange={(evento) => definirReferencia(evento.target.value)}
                  maxLength={100}
                  placeholder="Referência do pedido"
                />
              </div>
              <div className="campo">
                <label htmlFor="estado-pedido">Estado do pagamento local</label>
                <select
                  id="estado-pedido"
                  value={status}
                  onChange={(evento) =>
                    definirStatus(evento.target.value as FiltroPagamento | "")
                  }
                >
                  <option value="">Todos</option>
                  {estados.map((estado) => (
                    <option key={estado.valor} value={estado.valor}>
                      {estado.nome}
                    </option>
                  ))}
                </select>
              </div>
              <div className="campo">
                <label htmlFor="limite-pedidos">Itens por página</label>
                <select
                  id="limite-pedidos"
                  value={limite}
                  onChange={(evento) =>
                    definirLimite(Number(evento.target.value))
                  }
                >
                  {[10, 20, 50, 100].map((valor) => (
                    <option key={valor} value={valor}>
                      {valor}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <button type="submit" className="botao-principal acao-compacta">
              Aplicar filtros
            </button>
          </fieldset>
        </form>
      </section>
      <section className="painel-pagamentos" aria-labelledby="titulo-pedidos">
        <div className="titulo-painel">
          <h2 id="titulo-pedidos">Pedidos e transações</h2>
          <button
            className="botao-secundario"
            onClick={atualizar}
            disabled={carregando}
          >
            Atualizar
          </button>
        </div>
        {erro && (
          <p className="mensagem-erro" role="alert">
            {erro}
          </p>
        )}
        {carregando && (
          <p className="estado-vazio" role="status">
            Consultando registros…
          </p>
        )}
        {resultado?.dados.length === 0 && (
          <p className="estado-vazio">
            Nenhum pedido encontrado para esta consulta.
          </p>
        )}
        {!!resultado?.dados.length && (
          <div className="rolagem-tabela">
            <table className="tabela-pagamentos">
              <caption className="somente-leitor">
                Pedidos locais do lojista autenticado
              </caption>
              <thead>
                <tr>
                  <th>Referência / detalhes</th>
                  <th>Valor</th>
                  <th>Método</th>
                  <th>Pedido</th>
                  <th>Link</th>
                  <th>Criação</th>
                </tr>
              </thead>
              <tbody>
                {resultado.dados.map((pedido) => (
                  <tr key={pedido.id}>
                    <td>
                      <details>
                        <summary className="identificador">
                          {pedido.referenciaExterna}
                        </summary>
                        <div className="detalhes-pedido">
                          <p>ID local: {pedido.id}</p>
                          <p>
                            Atualizado em:{" "}
                            {new Date(pedido.atualizadoEm).toLocaleString(
                              "pt-BR",
                            )}
                          </p>
                          {pedido.transacoes.length === 0 ? (
                            <p>Sem transação registrada.</p>
                          ) : (
                            pedido.transacoes.map((transacao) => (
                              <dl key={transacao.id}>
                                <dt>Transação local</dt>
                                <dd>{transacao.id}</dd>
                                <dt>Estado</dt>
                                <dd>{transacao.estado}</dd>
                                <dt>Método</dt>
                                <dd>
                                  {transacao.tipo === "PIX" ? "Pix" : "Cartão"}
                                </dd>
                                <dt>Valor</dt>
                                <dd>
                                  {moeda.format(transacao.valorCentavos / 100)}
                                </dd>
                                <dt>Taxa registrada</dt>
                                <dd>
                                  {transacao.taxaCentavos === null
                                    ? "Não informada"
                                    : moeda.format(
                                        transacao.taxaCentavos / 100,
                                      )}
                                </dd>
                                <dt>Valor líquido registrado</dt>
                                <dd>
                                  {transacao.valorLiquidoCentavos === null
                                    ? "Não informado"
                                    : moeda.format(
                                        transacao.valorLiquidoCentavos / 100,
                                      )}
                                </dd>
                                <dt>Criação</dt>
                                <dd>
                                  {new Date(transacao.criadoEm).toLocaleString(
                                    "pt-BR",
                                  )}
                                </dd>
                              </dl>
                            ))
                          )}
                        </div>
                      </details>
                    </td>
                    <td>{moeda.format(pedido.checkout.valorCentavos / 100)}</td>
                    <td>
                      {pedido.checkout.metodo === "PIX" ? "Pix" : "Cartão"}
                    </td>
                    <td>
                      <span className="etiqueta-informativa">
                        {pedido.estadoPedido}
                      </span>
                    </td>
                    <td>{pedido.checkout.estadoLink}</td>
                    <td>{new Date(pedido.criadoEm).toLocaleString("pt-BR")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {resultado && (
          <nav
            className="paginacao-pagamentos"
            aria-label="Paginação dos pedidos"
          >
            <span>
              {resultado.total} registro(s) · Página {resultado.pagina} de{" "}
              {Math.max(1, resultado.totalPaginas)}
            </span>
            <div>
              <button
                className="botao-secundario"
                disabled={resultado.pagina <= 1}
                onClick={() => paginar(resultado.pagina - 1)}
              >
                Anterior
              </button>
              <button
                className="botao-secundario"
                disabled={
                  resultado.pagina >= resultado.totalPaginas ||
                  resultado.pagina >= 100000
                }
                onClick={() => paginar(resultado.pagina + 1)}
              >
                Próxima
              </button>
            </div>
          </nav>
        )}
      </section>
    </div>
  );
}
