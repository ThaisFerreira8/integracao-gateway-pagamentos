import { useEffect, useState, type FormEvent } from "react";
import {
  consultarTaxas,
  criarLink,
  listarLinks,
  reaisParaCentavos,
  type LinkPagamento,
  type MetodoPagamento,
  type TaxaDisponivel,
} from "../servicos/api";

const moeda = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
});

export default function LinksPagamento() {
  const [links, definirLinks] = useState<LinkPagamento[] | null>(null);
  const [revisao, definirRevisao] = useState(0);
  const [erroLista, definirErroLista] = useState("");
  const [erro, definirErro] = useState("");
  const [mensagem, definirMensagem] = useState("");
  const [valor, definirValor] = useState("");
  const [metodo, definirMetodo] = useState<MetodoPagamento>("PIX");
  const [expiracao, definirExpiracao] = useState("");
  const [criando, definirCriando] = useState(false);
  const [taxas, definirTaxas] = useState<TaxaDisponivel[] | null>(null);
  const [consultandoTaxas, definirConsultandoTaxas] = useState(false);
  const [erroTaxas, definirErroTaxas] = useState("");

  useEffect(() => {
    let atual = true;
    listarLinks()
      .then((retorno) => {
        if (atual) definirLinks(retorno);
      })
      .catch((falha: unknown) => {
        if (atual)
          definirErroLista(
            falha instanceof Error
              ? falha.message
              : "Não foi possível carregar os links.",
          );
      });
    return () => {
      atual = false;
    };
  }, [revisao]);

  function atualizarLista() {
    definirLinks(null);
    definirErroLista("");
    definirRevisao((anterior) => anterior + 1);
  }

  async function enviar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    if (criando) return;
    definirErro("");
    definirMensagem("");
    try {
      const valorCentavos = reaisParaCentavos(valor);
      const data = new Date(expiracao);
      if (!Number.isFinite(data.getTime()) || data.getTime() <= Date.now()) {
        throw new Error("Escolha uma data futura de expiração.");
      }
      definirCriando(true);
      await criarLink({ valorCentavos, metodo, expiraEm: data.toISOString() });
      definirMensagem(
        "Link criado. A criação do link ainda não executa um pagamento.",
      );
      definirValor("");
      definirExpiracao("");
      atualizarLista();
    } catch (falha) {
      definirErro(
        falha instanceof Error
          ? falha.message
          : "Não foi possível criar o link.",
      );
    } finally {
      definirCriando(false);
    }
  }

  async function copiar(identificador: string) {
    definirErro("");
    definirMensagem("");
    try {
      await navigator.clipboard.writeText(
        new URL("/checkout/" + identificador, window.location.origin).href,
      );
      definirMensagem("Endereço do checkout copiado.");
    } catch {
      definirErro(
        "Não foi possível copiar. Abra o checkout e copie o endereço do navegador.",
      );
    }
  }

  async function carregarTaxas() {
    definirConsultandoTaxas(true);
    definirErroTaxas("");
    try {
      definirTaxas(await consultarTaxas());
    } catch (falha) {
      definirErroTaxas(
        falha instanceof Error
          ? falha.message
          : "Não foi possível consultar as taxas.",
      );
    } finally {
      definirConsultandoTaxas(false);
    }
  }

  return (
    <div className="pagamentos-conteudo">
      <section className="painel-pagamentos" aria-labelledby="titulo-novo-link">
        <div className="titulo-painel">
          <h2 id="titulo-novo-link">Criar link de pagamento</h2>
          <span className="etiqueta-informativa">Checkout próprio</span>
        </div>
        <p className="texto-auxiliar">
          É necessário ter uma conta gateway já vinculada e acesso válido para
          criar links.
        </p>
        <form onSubmit={enviar} aria-busy={criando}>
          <fieldset disabled={criando || (links === null && !erroLista)}>
            <div className="grade-formulario">
              <div className="campo">
                <label htmlFor="valor-link">Valor em reais</label>
                <input
                  id="valor-link"
                  inputMode="decimal"
                  value={valor}
                  onChange={(evento) => definirValor(evento.target.value)}
                  placeholder="0,00"
                  maxLength={20}
                  aria-describedby="ajuda-valor"
                  required
                />
                <small id="ajuda-valor">
                  Até duas casas decimais, sem separador de milhar.
                </small>
              </div>
              <div className="campo">
                <label htmlFor="metodo-link">Método</label>
                <select
                  id="metodo-link"
                  value={metodo}
                  onChange={(evento) =>
                    definirMetodo(evento.target.value as MetodoPagamento)
                  }
                >
                  <option value="PIX">Pix</option>
                  <option value="CARTAO">Cartão</option>
                </select>
              </div>
              <div className="campo">
                <label htmlFor="expiracao-link">
                  Expiração (horário local)
                </label>
                <input
                  id="expiracao-link"
                  type="datetime-local"
                  value={expiracao}
                  onChange={(evento) => definirExpiracao(evento.target.value)}
                  required
                />
              </div>
            </div>
            <button className="botao-principal acao-compacta" type="submit">
              {criando ? "Criando…" : "Criar link"}
            </button>
          </fieldset>
        </form>
        {erro && (
          <p className="mensagem-erro" role="alert">
            {erro}
          </p>
        )}
        {mensagem && (
          <p className="mensagem-sucesso" role="status">
            {mensagem}
          </p>
        )}
      </section>
      <section className="painel-pagamentos" aria-labelledby="titulo-links">
        <div className="titulo-painel">
          <h2 id="titulo-links">Seus links</h2>
          <button
            className="botao-secundario"
            onClick={atualizarLista}
            disabled={links === null && !erroLista}
          >
            Atualizar
          </button>
        </div>
        {erroLista && (
          <p className="mensagem-erro" role="alert">
            {erroLista}
          </p>
        )}
        {links === null && !erroLista && (
          <p role="status" className="estado-vazio">
            Carregando links…
          </p>
        )}
        {links?.length === 0 && (
          <p className="estado-vazio">
            Você ainda não criou links de pagamento.
          </p>
        )}
        {!!links?.length && (
          <div className="rolagem-tabela">
            <table className="tabela-pagamentos">
              <caption className="somente-leitor">
                Links do lojista autenticado
              </caption>
              <thead>
                <tr>
                  <th>Identificador público</th>
                  <th>Valor</th>
                  <th>Método</th>
                  <th>Estado do link</th>
                  <th>Expiração</th>
                  <th>Ações</th>
                </tr>
              </thead>
              <tbody>
                {links.map((link) => (
                  <tr key={link.identificadorPublico}>
                    <td className="identificador">
                      {link.identificadorPublico}
                    </td>
                    <td>{moeda.format(link.valorCentavos / 100)}</td>
                    <td>{link.metodo === "PIX" ? "Pix" : "Cartão"}</td>
                    <td>
                      <span className="etiqueta-informativa">
                        {link.estado}
                      </span>
                    </td>
                    <td>{new Date(link.expiraEm).toLocaleString("pt-BR")}</td>
                    <td>
                      <div className="acoes-tabela">
                        <button
                          className="botao-texto"
                          onClick={() => void copiar(link.identificadorPublico)}
                          aria-label={
                            "Copiar link " + link.identificadorPublico
                          }
                        >
                          Copiar
                        </button>
                        <a
                          href={"/checkout/" + link.identificadorPublico}
                          target="_blank"
                          rel="noopener noreferrer"
                          aria-label={
                            "Abrir checkout " + link.identificadorPublico
                          }
                        >
                          Abrir ↗
                        </a>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
      <section className="painel-pagamentos" aria-labelledby="titulo-taxas">
        <div className="titulo-painel">
          <h2 id="titulo-taxas">Taxas e parcelas disponíveis</h2>
          <button
            className="botao-secundario"
            onClick={() => void carregarTaxas()}
            disabled={consultandoTaxas}
          >
            {consultandoTaxas ? "Consultando…" : "Consultar taxas"}
          </button>
        </div>
        <p className="texto-auxiliar">
          A tabela informa as opções do gateway. Consultá-la não aplica uma taxa
          nem seleciona parcelas para um pagamento.
        </p>
        {erroTaxas && (
          <p className="mensagem-erro" role="alert">
            {erroTaxas}
          </p>
        )}
        {taxas && (
          <div className="rolagem-tabela">
            <table className="tabela-pagamentos">
              <caption className="somente-leitor">
                Tabela de taxas disponíveis, sem aplicação ao link
              </caption>
              <thead>
                <tr>
                  <th>Bandeira</th>
                  <th>Parcelas disponíveis</th>
                  <th>Taxa disponível</th>
                </tr>
              </thead>
              <tbody>
                {taxas.map((taxa, indice) => (
                  <tr key={indice}>
                    <td>{taxa.bandeira}</td>
                    <td>{taxa.parcelas}x</td>
                    <td>
                      {taxa.taxaPercentual.toLocaleString("pt-BR", {
                        maximumFractionDigits: 4,
                      })}
                      %
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {taxas.length === 0 && (
              <p className="estado-vazio">Nenhuma opção retornada.</p>
            )}
          </div>
        )}
      </section>
    </div>
  );
}
