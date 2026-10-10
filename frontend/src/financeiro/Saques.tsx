import { useEffect, useState } from "react";
import { listarSaques, consultarSaque, type SaqueLocal } from "../servicos/api";

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
      <p className="aviso-pagamentos">
        Esta tela consulta somente saques registrados localmente. A solicitação
        de saque e a atualização pelo gateway ainda não estão disponíveis.
      </p>
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
