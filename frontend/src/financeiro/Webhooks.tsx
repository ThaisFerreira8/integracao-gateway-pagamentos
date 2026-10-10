import { useEffect, useState, type FormEvent } from "react";
import {
  listarWebhooks,
  configurarWebhook,
  removerWebhook,
  type EventoWebhook,
} from "../servicos/api";

export default function Webhooks() {
  const [listaVazia, definirListaVazia] = useState(false);
  const [erroLista, definirErroLista] = useState("");
  const [revisao, definirRevisao] = useState(0);
  const [evento, definirEvento] = useState<EventoWebhook>("PAYMENT_PIX");
  const [url, definirUrl] = useState("");
  const [secret, definirSecret] = useState("");
  const [idRemocao, definirIdRemocao] = useState("");
  const [confirmacao, definirConfirmacao] = useState(false);
  const [ocupado, definirOcupado] = useState(false);
  const [erro, definirErro] = useState("");
  const [mensagem, definirMensagem] = useState("");
  useEffect(() => {
    let atual = true;
    listarWebhooks()
      .then(() => {
        if (atual) definirListaVazia(true);
      })
      .catch((falha: unknown) => {
        if (atual)
          definirErroLista(
            falha instanceof Error
              ? falha.message
              : "Não foi possível consultar as configurações.",
          );
      });
    return () => {
      atual = false;
    };
  }, [revisao]);
  function atualizar() {
    definirListaVazia(false);
    definirErroLista("");
    definirRevisao((anterior) => anterior + 1);
  }
  async function configurar(eventoFormulario: FormEvent<HTMLFormElement>) {
    eventoFormulario.preventDefault();
    if (ocupado) return;
    definirOcupado(true);
    definirErro("");
    definirMensagem("");
    // O secret permanece apenas na entrada transitória e é apagado ao iniciar o envio.
    const entrada = {
      event: evento,
      url: url.trim(),
      ...(secret ? { secret } : {}),
    };
    definirSecret("");
    try {
      await configurarWebhook(entrada);
      definirMensagem(
        "Configuração aceita pelo gateway. A identidade e os detalhes da configuração não foram retornados.",
      );
      definirUrl("");
      atualizar();
    } catch (falha) {
      definirErro(
        falha instanceof Error
          ? falha.message
          : "Não foi possível configurar o webhook.",
      );
    } finally {
      definirOcupado(false);
    }
  }
  async function remover(eventoFormulario: FormEvent<HTMLFormElement>) {
    eventoFormulario.preventDefault();
    if (ocupado || !confirmacao) return;
    definirOcupado(true);
    definirErro("");
    definirMensagem("");
    try {
      await removerWebhook(idRemocao);
      definirMensagem("Remoção aceita pelo gateway, sem detalhes de resposta.");
      definirIdRemocao("");
      atualizar();
    } catch (falha) {
      definirErro(
        falha instanceof Error
          ? falha.message
          : "Não foi possível remover o webhook.",
      );
    } finally {
      definirConfirmacao(false);
      definirOcupado(false);
    }
  }
  return (
    <div className="financeiro-conteudo">
      <p className="aviso-pagamentos">
        Administração de configurações. O BaaS ainda não recebe callbacks,
        valida assinaturas HMAC ou atualiza estados financeiros por webhook.
      </p>
      <section
        className="painel-pagamentos"
        aria-labelledby="titulo-configuracoes"
      >
        <div className="titulo-painel">
          <h2 id="titulo-configuracoes">Configurações de webhook</h2>
          <button
            className="botao-secundario"
            onClick={atualizar}
            disabled={ocupado || (!listaVazia && !erroLista)}
          >
            Atualizar
          </button>
        </div>
        {erroLista && (
          <p className="mensagem-erro" role="alert">
            {erroLista} A estrutura de configurações não vazias ainda não foi
            confirmada; esta falha não significa ausência de webhooks.
          </p>
        )}
        {!listaVazia && !erroLista && (
          <p className="estado-vazio" role="status">
            Consultando configurações…
          </p>
        )}
        {listaVazia && (
          <p className="estado-vazio">
            Nenhuma configuração retornada pelo gateway.
          </p>
        )}
      </section>
      <section
        className="painel-pagamentos"
        aria-labelledby="titulo-configurar-webhook"
      >
        <div className="titulo-painel">
          <h2 id="titulo-configurar-webhook">Configurar webhook</h2>
        </div>
        <form onSubmit={configurar} aria-busy={ocupado} autoComplete="off">
          <fieldset disabled={ocupado}>
            <div className="grade-formulario">
              <div className="campo">
                <label htmlFor="evento-webhook">Evento</label>
                <select
                  id="evento-webhook"
                  value={evento}
                  onChange={(entrada) =>
                    definirEvento(entrada.target.value as EventoWebhook)
                  }
                >
                  <option value="PAYMENT_PIX">Pagamento Pix</option>
                  <option value="PAYMENT_CARD">Pagamento com cartão</option>
                  <option value="WITHDRAWAL">Saque</option>
                </select>
              </div>
              <div className="campo">
                <label htmlFor="url-webhook">URL HTTPS de destino</label>
                <input
                  id="url-webhook"
                  type="url"
                  value={url}
                  onChange={(entrada) => definirUrl(entrada.target.value)}
                  placeholder="https://seu-destino.example/callback"
                  required
                />
              </div>
              <div className="campo">
                <label htmlFor="secret-webhook">Secret (opcional)</label>
                <input
                  id="secret-webhook"
                  type="password"
                  autoComplete="off"
                  value={secret}
                  onChange={(entrada) => definirSecret(entrada.target.value)}
                  aria-describedby="ajuda-secret"
                />
                <small id="ajuda-secret">
                  Enviado somente nesta configuração; não é salvo pela
                  interface.
                </small>
              </div>
            </div>
            <button
              className="botao-principal acao-compacta"
              type="submit"
              disabled={!listaVazia && !erroLista}
            >
              {ocupado ? "Aguarde…" : "Enviar configuração"}
            </button>
          </fieldset>
        </form>
      </section>
      <section
        className="painel-pagamentos"
        aria-labelledby="titulo-remover-webhook"
      >
        <h2 id="titulo-remover-webhook">Remover configuração</h2>
        <p className="texto-auxiliar">
          Informe somente um ID já conhecido da sua configuração. A listagem
          atual não fornece IDs para remoção.
        </p>
        <form onSubmit={remover}>
          <fieldset disabled={ocupado}>
            <div className="campo">
              <label htmlFor="id-webhook">Identificador da configuração</label>
              <input
                id="id-webhook"
                value={idRemocao}
                onChange={(entrada) => {
                  definirIdRemocao(entrada.target.value);
                  definirConfirmacao(false);
                }}
                autoComplete="off"
                required
              />
            </div>
            <label className="confirmacao-financeira">
              <input
                type="checkbox"
                checked={confirmacao}
                onChange={(entrada) =>
                  definirConfirmacao(entrada.target.checked)
                }
                required
              />
              Confirmo a remoção da configuração identificada acima.
            </label>
            <button
              className="botao-secundario acao-remover"
              type="submit"
              disabled={!confirmacao || (!listaVazia && !erroLista)}
            >
              Remover configuração
            </button>
          </fieldset>
        </form>
      </section>
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
    </div>
  );
}
