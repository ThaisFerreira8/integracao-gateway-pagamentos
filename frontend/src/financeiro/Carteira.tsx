import { useEffect, useState, type FormEvent } from "react";
import {
  consultarCarteira,
  consultarExtrato,
  type CarteiraLojista,
  type ExtratoLojista,
  type EstadoExtrato,
  type TipoExtrato,
} from "../servicos/api";

export default function Carteira() {
  const [carteira, definirCarteira] = useState<CarteiraLojista | null>(null);
  const [erroSaldo, definirErroSaldo] = useState("");
  const [revisao, definirRevisao] = useState(0);
  const [extrato, definirExtrato] = useState<ExtratoLojista | null>(null);
  const [erroExtrato, definirErroExtrato] = useState("");
  const [consultando, definirConsultando] = useState(false);
  const [status, definirStatus] = useState<EstadoExtrato | "">("");
  const [tipo, definirTipo] = useState<TipoExtrato | "">("");
  const [limite, definirLimite] = useState("");

  useEffect(() => {
    let atual = true;
    consultarCarteira()
      .then((dados) => {
        if (atual) definirCarteira(dados);
      })
      .catch((falha: unknown) => {
        if (atual)
          definirErroSaldo(
            falha instanceof Error
              ? falha.message
              : "Não foi possível consultar o saldo.",
          );
      });
    return () => {
      atual = false;
    };
  }, [revisao]);

  function atualizarSaldo() {
    definirCarteira(null);
    definirErroSaldo("");
    definirRevisao((anterior) => anterior + 1);
  }
  async function buscarExtrato(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    if (consultando) return;
    definirExtrato(null);
    definirErroExtrato("");
    try {
      if (limite && !/^\d+$/.test(limite))
        throw new Error("O limite deve ser um inteiro positivo.");
      definirConsultando(true);
      definirExtrato(
        await consultarExtrato({
          ...(status ? { status } : {}),
          ...(tipo ? { type: tipo } : {}),
          ...(limite ? { limit: Number(limite) } : {}),
        }),
      );
    } catch (falha) {
      definirErroExtrato(
        falha instanceof Error
          ? falha.message
          : "Não foi possível consultar o extrato.",
      );
    } finally {
      definirConsultando(false);
    }
  }

  return (
    <div className="financeiro-conteudo">
      <section className="painel-pagamentos" aria-labelledby="titulo-saldo">
        <div className="titulo-painel">
          <h2 id="titulo-saldo">Saldo da carteira</h2>
          <button
            className="botao-secundario"
            onClick={atualizarSaldo}
            disabled={!carteira && !erroSaldo}
          >
            Atualizar saldo
          </button>
        </div>
        {erroSaldo && (
          <p className="mensagem-erro" role="alert">
            {erroSaldo}
          </p>
        )}
        {!carteira && !erroSaldo && (
          <p className="estado-vazio" role="status">
            Consultando saldo…
          </p>
        )}
        {carteira && (
          <>
            <p className="saldo-financeiro">{carteira.balanceFormatted}</p>
            <p className="texto-auxiliar">
              Atualizado em{" "}
              {new Date(carteira.updatedAt).toLocaleString("pt-BR")}. Valor
              exibido conforme a formatação retornada pela carteira.
            </p>
          </>
        )}
      </section>
      <section className="painel-pagamentos" aria-labelledby="titulo-extrato">
        <div className="titulo-painel">
          <h2 id="titulo-extrato">Consultar extrato</h2>
        </div>
        <form onSubmit={buscarExtrato} aria-busy={consultando}>
          <fieldset disabled={consultando}>
            <div className="grade-formulario">
              <div className="campo">
                <label htmlFor="status-extrato">Estado</label>
                <select
                  id="status-extrato"
                  value={status}
                  onChange={(evento) =>
                    definirStatus(evento.target.value as EstadoExtrato | "")
                  }
                >
                  <option value="">Todos</option>
                  <option value="PENDING">Pendente</option>
                  <option value="APPROVED">Aprovado</option>
                  <option value="DENIED">Negado</option>
                  <option value="EXPIRED">Expirado</option>
                  <option value="CANCELLED">Cancelado</option>
                </select>
              </div>
              <div className="campo">
                <label htmlFor="tipo-extrato">Tipo</label>
                <select
                  id="tipo-extrato"
                  value={tipo}
                  onChange={(evento) =>
                    definirTipo(evento.target.value as TipoExtrato | "")
                  }
                >
                  <option value="">Todos</option>
                  <option value="PIX">Pix</option>
                  <option value="CREDIT_CARD">Cartão</option>
                  <option value="WITHDRAWAL">Saque</option>
                </select>
              </div>
              <div className="campo">
                <label htmlFor="limite-extrato">
                  Limite de registros (opcional)
                </label>
                <input
                  id="limite-extrato"
                  inputMode="numeric"
                  value={limite}
                  onChange={(evento) => definirLimite(evento.target.value)}
                  placeholder="Inteiro positivo"
                />
              </div>
            </div>
            <button className="botao-principal acao-compacta" type="submit">
              {consultando ? "Consultando…" : "Consultar extrato"}
            </button>
          </fieldset>
        </form>
        <p className="texto-auxiliar">
          A exibição de transações depende da confirmação do formato dos itens.
          Não há paginação nem consolidação com registros locais nesta consulta.
        </p>
        {erroExtrato && (
          <p className="mensagem-erro" role="alert">
            {erroExtrato} A consulta não foi concluída; não é possível afirmar
            que o extrato está vazio.
          </p>
        )}
        {extrato && (
          <div className="resultado-financeiro" role="status">
            <p>
              Saldo retornado nesta consulta:{" "}
              <strong>{extrato.balanceFormatted}</strong>
            </p>
            <p className="estado-vazio">
              Nenhuma transação retornada para os filtros consultados.
            </p>
          </div>
        )}
      </section>
    </div>
  );
}
