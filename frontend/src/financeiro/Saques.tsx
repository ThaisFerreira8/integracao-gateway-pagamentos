import { useEffect, useRef, useState, type FormEvent } from "react";
import {
  listarSaques,
  consultarSaque,
  solicitarSaque,
  conciliarSaque,
  reaisParaCentavos,
  type SaqueLocal,
} from "../servicos/api";

const moeda = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
});
export default function Saques() {
  const [saques, definirSaques] = useState<SaqueLocal[] | null>(null);
  const [erro, definirErro] = useState("");
  const [revisao, definirRevisao] = useState(0);
  const [selecionado, definirSelecionado] = useState<SaqueLocal | null>(null);
  const [erroDetalhe, definirErroDetalhe] = useState("");
  const [consultando, definirConsultando] = useState(false);
  const [enviando, definirEnviando] = useState(false);
  const trava = useRef(false);
  const [mensagem, definirMensagem] = useState("");
  const [erroSolicitacao, definirErroSolicitacao] = useState("");

  async function solicitar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    if (trava.current) return;
    const formulario = evento.currentTarget;
    const dados = new FormData(formulario);
    definirErroSolicitacao("");
    definirMensagem("");
    try {
      const entrada = {
        valorCentavos: reaisParaCentavos(String(dados.get("valor"))),
        chavePix: String(dados.get("chavePix") ?? "").trim(),
        documentoTitular: String(dados.get("documentoTitular") ?? ""),
        descricao: String(dados.get("descricao") ?? "").trim() || undefined,
      };
      trava.current = true;
      definirEnviando(true);
      // Não retém chave Pix ou documento no estado da interface.
      formulario.reset();
      const saque = await solicitarSaque(entrada);
      atualizar();
      definirSelecionado(saque);
      definirMensagem(`Solicitação registrada. Estado: ${saque.estado}.`);
    } catch (falha) {
      definirErroSolicitacao(
        (falha instanceof Error
          ? falha.message
          : "Não foi possível confirmar a solicitação.") +
          " Confira a listagem antes de tentar novamente.",
      );
      atualizar();
    } finally {
      trava.current = false;
      definirEnviando(false);
    }
  }

  async function conciliar(id: string) {
    if (consultando || enviando) return;
    definirConsultando(true);
    definirErroDetalhe("");
    try {
      const saque = await conciliarSaque(id);
      definirSelecionado(saque);
      definirSaques(
        (anteriores) =>
          anteriores?.map((item) => (item.id === id ? saque : item)) ?? null,
      );
    } catch (falha) {
      definirErroDetalhe(
        falha instanceof Error
          ? falha.message
          : "Não foi possível atualizar o status.",
      );
    } finally {
      definirConsultando(false);
    }
  }
  useEffect(() => {
    let atual = true;
    listarSaques()
      .then((dados) => {
        if (atual) definirSaques(dados);
      })
      .catch((falha: unknown) => {
        if (atual)
          definirErro(
            falha instanceof Error
              ? falha.message
              : "Não foi possível listar os saques.",
          );
      });
    return () => {
      atual = false;
    };
  }, [revisao]);
  function atualizar() {
    definirSaques(null);
    definirErro("");
    definirSelecionado(null);
    definirErroDetalhe("");
    definirRevisao((anterior) => anterior + 1);
  }
  async function consultar(id: string) {
    if (consultando) return;
    definirConsultando(true);
    definirSelecionado(null);
    definirErroDetalhe("");
    try {
      definirSelecionado(await consultarSaque(id));
    } catch (falha) {
      definirErroDetalhe(
        falha instanceof Error
          ? falha.message
          : "Não foi possível consultar o saque.",
      );
    } finally {
      definirConsultando(false);
    }
  }
  return (
    <div className="financeiro-conteudo">
      <section
        className="painel-pagamentos"
        aria-labelledby="titulo-solicitar-saque"
      >
        <h2 id="titulo-solicitar-saque">Solicitar saque</h2>
        <form onSubmit={solicitar} aria-busy={enviando}>
          <fieldset disabled={enviando || consultando}>
            <div className="grade-formulario">
              <div className="campo">
                <label htmlFor="valor-saque">Valor em reais</label>
                <input
                  id="valor-saque"
                  name="valor"
                  inputMode="decimal"
                  maxLength={20}
                  placeholder="0,00"
                  required
                />
              </div>
              <div className="campo">
                <label htmlFor="chave-saque">Chave Pix</label>
                <input
                  id="chave-saque"
                  name="chavePix"
                  maxLength={254}
                  autoComplete="off"
                  required
                />
              </div>
              <div className="campo">
                <label htmlFor="cpf-saque">CPF do titular (11 dígitos)</label>
                <input
                  id="cpf-saque"
                  name="documentoTitular"
                  inputMode="numeric"
                  pattern="[0-9]{11}"
                  maxLength={11}
                  autoComplete="off"
                  required
                />
              </div>
              <div className="campo">
                <label htmlFor="descricao-saque">Descrição (opcional)</label>
                <input id="descricao-saque" name="descricao" maxLength={255} />
              </div>
            </div>
            <button className="botao-principal acao-compacta" type="submit">
              {enviando ? "Solicitando…" : "Solicitar saque"}
            </button>
          </fieldset>
        </form>
        {erroSolicitacao && (
          <p className="mensagem-erro" role="alert">
            {erroSolicitacao}
          </p>
        )}
        {mensagem && (
          <p className="mensagem-sucesso" role="status">
            {mensagem}
          </p>
        )}
      </section>
      <section className="painel-pagamentos" aria-labelledby="titulo-saques">
        <div className="titulo-painel">
          <h2 id="titulo-saques">Saques locais</h2>
          <button
            className="botao-secundario"
            onClick={atualizar}
            disabled={consultando || (!saques && !erro)}
          >
            Atualizar
          </button>
        </div>
        {erro && (
          <p className="mensagem-erro" role="alert">
            {erro}
          </p>
        )}
        {!saques && !erro && (
          <p className="estado-vazio" role="status">
            Consultando registros…
          </p>
        )}
        {saques?.length === 0 && (
          <p className="estado-vazio">Nenhum saque local registrado.</p>
        )}
        {!!saques?.length && (
          <div className="rolagem-tabela">
            <table className="tabela-pagamentos">
              <caption className="somente-leitor">
                Saques locais do lojista autenticado
              </caption>
              <thead>
                <tr>
                  <th>Referência</th>
                  <th>Valor</th>
                  <th>Estado local</th>
                  <th>Criação</th>
                  <th>Ação</th>
                </tr>
              </thead>
              <tbody>
                {saques.map((saque) => (
                  <tr key={saque.id}>
                    <td className="identificador">{saque.referenciaExterna}</td>
                    <td>{moeda.format(saque.valorCentavos / 100)}</td>
                    <td>{saque.estado}</td>
                    <td>{new Date(saque.criadoEm).toLocaleString("pt-BR")}</td>
                    <td>
                      <button
                        className="botao-texto"
                        onClick={() => void consultar(saque.id)}
                        disabled={consultando}
                      >
                        Consultar detalhes
                      </button>
                      <button
                        className="botao-texto"
                        onClick={() => void conciliar(saque.id)}
                        disabled={consultando || enviando}
                      >
                        Consultar status externo
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {consultando && (
          <p className="estado-vazio" role="status">
            Consultando detalhes…
          </p>
        )}
        {erroDetalhe && (
          <p className="mensagem-erro" role="alert">
            {erroDetalhe}
          </p>
        )}
        {selecionado && (
          <section
            className="resultado-financeiro"
            aria-labelledby="titulo-detalhe-saque"
          >
            <h3 id="titulo-detalhe-saque">Detalhes do saque local</h3>
            <dl className="detalhes-financeiros">
              <dt>ID local</dt>
              <dd>{selecionado.id}</dd>
              <dt>Referência externa</dt>
              <dd>{selecionado.referenciaExterna}</dd>
              <dt>Valor</dt>
              <dd>{moeda.format(selecionado.valorCentavos / 100)}</dd>
              <dt>Estado local</dt>
              <dd>{selecionado.estado}</dd>
              <dt>Criação</dt>
              <dd>{new Date(selecionado.criadoEm).toLocaleString("pt-BR")}</dd>
              <dt>Última atualização local</dt>
              <dd>
                {new Date(selecionado.atualizadoEm).toLocaleString("pt-BR")}
              </dd>
            </dl>
          </section>
        )}
      </section>
    </div>
  );
}
