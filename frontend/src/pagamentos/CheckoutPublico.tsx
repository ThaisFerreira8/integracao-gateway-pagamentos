import { useEffect, useState } from "react";
import {
  consultarCheckout,
  type CheckoutPublico as DadosCheckout,
} from "../servicos/api";

export default function CheckoutPublico({
  identificador,
}: {
  identificador: string;
}) {
  const [checkout, definirCheckout] = useState<DadosCheckout | null>(null);
  const [erro, definirErro] = useState("");
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
            <p className="aviso-pagamentos">
              O pagamento por Pix ou cartão ainda não está disponível neste
              checkout. Não há cobrança executada por esta tela.
            </p>
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
