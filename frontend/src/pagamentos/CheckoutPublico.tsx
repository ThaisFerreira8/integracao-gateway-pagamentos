import { useEffect, useState, type FormEvent } from "react";
import {
  consultarCheckout,
  pagarCheckout,
  type ResultadoPagamento,
  type CheckoutPublico as DadosCheckout,
} from "../servicos/api";

export default function CheckoutPublico({
  identificador,
}: {
  identificador: string;
}) {
  const [checkout, definirCheckout] = useState<DadosCheckout | null>(null);
  const [erro, definirErro] = useState("");
  const [resultado, definirResultado] = useState<ResultadoPagamento | null>(
    null,
  );
  const [enviando, definirEnviando] = useState(false);
  const [tentou, definirTentou] = useState(false);
  async function pagar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    if (!checkout || enviando || tentou) return;
    const formulario = evento.currentTarget;
    const dados = new FormData(formulario);
    const entrada: Record<string, string | number> = {};
    dados.forEach((valor, chave) => {
      if (typeof valor === "string") entrada[chave] = valor;
    });
    if (checkout.metodo === "CARTAO") {
      const taxa = checkout.taxas?.[Number(entrada.opcaoTaxa)];
      if (!taxa) {
        definirErro("Escolha uma opção válida de parcelas.");
        return;
      }
      entrada.bandeira = taxa.bandeira;
      entrada.parcelas = taxa.parcelas;
    }
    // Limpa as entradas antes da chamada; não mantém dados do cartão no estado React.
    formulario.reset();
    definirEnviando(true);
    definirTentou(true);
    definirErro("");
    try {
      definirResultado(
        await pagarCheckout(identificador, checkout.metodo, entrada),
      );
      definirCheckout(await consultarCheckout(identificador));
    } catch (falha) {
      definirErro(
        falha instanceof Error
          ? falha.message
          : "Não foi possível confirmar o pagamento. Não repita a operação.",
      );
    } finally {
      definirEnviando(false);
    }
  }
  useEffect(() => {
    let atual = true;
    consultarCheckout(identificador)
      .then((retorno) => {
        if (atual) definirCheckout(retorno);
      })
      .catch((falha: unknown) => {
        if (atual)
          definirErro(
            falha instanceof Error
              ? falha.message
              : "Não foi possível consultar o checkout.",
          );
      });
    return () => {
      atual = false;
    };
  }, [identificador]);

  return (
    <main className="checkout-publico">
      <header className="marca">
        <span className="marca-simbolo" aria-hidden="true">
          ϟ
        </span>
        Nexora
      </header>
      <section className="cartao-checkout" aria-labelledby="titulo-checkout">
        <p className="sobretitulo">LINK DE PAGAMENTO</p>
        <h1 id="titulo-checkout">Seu checkout</h1>
        {erro && (
          <p className="mensagem-erro" role="alert">
            {erro}
          </p>
        )}
        {!checkout && !erro && (
          <p className="estado-vazio" role="status">
            Consultando link…
          </p>
        )}
        {checkout && (
          <>
            <p className="valor-checkout">
              {new Intl.NumberFormat("pt-BR", {
                style: "currency",
                currency: "BRL",
              }).format(checkout.valorCentavos / 100)}
            </p>
            <dl className="resumo-checkout">
              <div>
                <dt>Método</dt>
                <dd>{checkout.metodo === "PIX" ? "Pix" : "Cartão"}</dd>
              </div>
              <div>
                <dt>Estado do link</dt>
                <dd>{checkout.estado}</dd>
              </div>
              <div>
                <dt>Expiração</dt>
                <dd>{new Date(checkout.expiraEm).toLocaleString("pt-BR")}</dd>
              </div>
              <div>
                <dt>Taxa efetivamente aplicada</dt>
                <dd>
                  {checkout.taxaAplicadaPercentual === null
                    ? "Nenhuma taxa registrada"
                    : Number(checkout.taxaAplicadaPercentual).toLocaleString(
                        "pt-BR",
                        { maximumFractionDigits: 4 },
                      ) + "%"}
                </dd>
              </div>
              <div>
                <dt>Parcelas registradas</dt>
                <dd>
                  {checkout.parcelas === null
                    ? "Nenhuma seleção registrada"
                    : checkout.parcelas + "x"}
                </dd>
              </div>
            </dl>
            {checkout.estado === "ATIVO" && !tentou && (
              <form onSubmit={pagar} autoComplete="off">
                <fieldset disabled={enviando}>
                  {checkout.metodo === "PIX" ? (
                    <div className="campo">
                      <label htmlFor="documento-pagador">
                        CPF/CNPJ do pagador
                      </label>
                      <input
                        id="documento-pagador"
                        name="documentoPagador"
                        inputMode="numeric"
                        pattern="(?:[0-9]{11}|[0-9]{14})"
                        required
                      />
                    </div>
                  ) : (
                    <>
                      <div className="campo">
                        <label htmlFor="numero-cartao">Número do cartão</label>
                        <input
                          id="numero-cartao"
                          name="numeroCartao"
                          inputMode="numeric"
                          pattern="[0-9]{13,19}"
                          required
                        />
                      </div>
                      <div className="campo">
                        <label htmlFor="titular-cartao">Titular</label>
                        <input
                          id="titular-cartao"
                          name="titularCartao"
                          maxLength={150}
                          required
                        />
                      </div>
                      <div className="grade-formulario">
                        <div className="campo">
                          <label htmlFor="mes-cartao">Mês</label>
                          <input
                            id="mes-cartao"
                            name="mesValidade"
                            pattern="(?:0[1-9]|1[0-2])"
                            placeholder="MM"
                            required
                          />
                        </div>
                        <div className="campo">
                          <label htmlFor="ano-cartao">Ano</label>
                          <input
                            id="ano-cartao"
                            name="anoValidade"
                            pattern="[0-9]{4}"
                            placeholder="AAAA"
                            required
                          />
                        </div>
                        <div className="campo">
                          <label htmlFor="cvv-cartao">
                            Código de segurança
                          </label>
                          <input
                            id="cvv-cartao"
                            name="codigoSeguranca"
                            type="password"
                            inputMode="numeric"
                            pattern="[0-9]{3,4}"
                            required
                          />
                        </div>
                      </div>
                      <div className="campo">
                        <label htmlFor="parcelas-cartao">
                          Bandeira e parcelas
                        </label>
                        <select
                          id="parcelas-cartao"
                          name="opcaoTaxa"
                          required
                          defaultValue=""
                        >
                          <option value="" disabled>
                            Selecione a bandeira do cartão e as parcelas
                          </option>
                          {checkout.taxas?.map((taxa, indice) => (
                            <option key={indice} value={indice}>
                              {taxa.bandeira} · {taxa.parcelas}x · taxa{" "}
                              {taxa.taxaPercentual.toLocaleString("pt-BR")}%
                            </option>
                          ))}
                        </select>
                      </div>
                    </>
                  )}
                  <button className="botao-principal" type="submit">
                    {enviando ? "Processando…" : "Enviar pagamento"}
                  </button>
                </fieldset>
              </form>
            )}
            {resultado && (
              <section aria-live="polite">
                <h2>Resultado: {resultado.estado}</h2>
                <p className="texto-auxiliar">
                  Identificador: {resultado.identificadorPagamento}
                </p>
                {resultado.emv && (
                  <div className="campo">
                    <label htmlFor="emv-pix">Pix copia e cola</label>
                    <input id="emv-pix" value={resultado.emv} readOnly />
                  </div>
                )}
                {resultado.qrCodeBase64 &&
                  /^(?:data:image\/png;base64,)?[A-Za-z0-9+/=\s]+$/.test(
                    resultado.qrCodeBase64,
                  ) && (
                    <img
                      src={
                        resultado.qrCodeBase64.startsWith("data:")
                          ? resultado.qrCodeBase64
                          : "data:image/png;base64," + resultado.qrCodeBase64
                      }
                      width={220}
                      height={220}
                      alt="QR Code Pix retornado pelo gateway"
                    />
                  )}
              </section>
            )}
            {tentou && (
              <p className="aviso-pagamentos">
                A tentativa já foi enviada. Em caso de falha ou resultado
                incerto, o lojista deve conciliar a operação antes de qualquer
                nova cobrança.
              </p>
            )}
            {checkout.taxas && (
              <section aria-labelledby="titulo-taxas-publicas">
                <h2 id="titulo-taxas-publicas">Opções de cartão disponíveis</h2>
                <p className="texto-auxiliar">
                  Estas taxas e parcelas são opções de consulta. Não representam
                  uma taxa aplicada ao pagamento.
                </p>
                <div className="rolagem-tabela">
                  <table className="tabela-pagamentos">
                    <caption className="somente-leitor">
                      Opções disponíveis de cartão
                    </caption>
                    <thead>
                      <tr>
                        <th>Bandeira</th>
                        <th>Parcelas</th>
                        <th>Taxa disponível</th>
                      </tr>
                    </thead>
                    <tbody>
                      {checkout.taxas.map((taxa, indice) => (
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
                  {checkout.taxas.length === 0 && (
                    <p className="estado-vazio">Nenhuma opção retornada.</p>
                  )}
                </div>
              </section>
            )}
          </>
        )}
      </section>
      <p className="rodape-checkout">Nexora · Consulta pública do link</p>
    </main>
  );
}
