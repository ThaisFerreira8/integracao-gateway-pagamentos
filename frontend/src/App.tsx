import { useEffect, useState, type FormEvent } from "react";
import {
  cadastrarLojista,
  entrar,
  sair,
  type UsuarioSessao,
} from "./servicos/api";
import "./App.css";
import LinksPagamento from "./pagamentos/LinksPagamento";
import CheckoutPublico from "./pagamentos/CheckoutPublico";
import Transacoes from "./pagamentos/Transacoes";
import "./pagamentos/pagamentos.css";
import Carteira from "./financeiro/Carteira";
import Saques from "./financeiro/Saques";
import Webhooks from "./financeiro/Webhooks";
import "./financeiro/financeiro.css";

const secoes = [
  "Visão geral",
  "Links de pagamento",
  "Transações",
  "Carteira",
  "Saques",
  "Webhooks",
] as const;
const icones = [
  "M3 3h6v6H3z M15 3h6v6h-6z M3 15h6v6H3z M15 15h6v6h-6z",
  "M10 13a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-2 2 M14 11a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l2-2",
  "M4 3v17h17 M8 16v-5 M13 16V6 M18 16v-8",
  "M4 6h15v14H4z M4 6V3h13 M15 11h6v5h-6z",
  "M6 18 18 6 M6 6h12v12",
  "M12 3v6 M5 18l4-7 M19 18l-4-7 M8 18h8",
];
function Marca() {
  return (
    <span className="marca">
      <span className="marca-simbolo" aria-hidden="true">
        ϟ
      </span>
      Nexora
    </span>
  );
}

function App() {
  const [caminho, definirCaminho] = useState(() => window.location.pathname);
  useEffect(() => {
    document.title = "Nexora";
    document.documentElement.lang = "pt-BR";
    const atualizarCaminho = () => definirCaminho(window.location.pathname);
    window.addEventListener("popstate", atualizarCaminho);
    return () => window.removeEventListener("popstate", atualizarCaminho);
  }, []);
  const [usuario, definirUsuario] = useState<UsuarioSessao | null>(null);
  const [cadastro, definirCadastro] = useState(false);
  const [nome, definirNome] = useState("");
  const [email, definirEmail] = useState("");
  const [senha, definirSenha] = useState("");
  const [mostrarSenha, definirMostrarSenha] = useState(false);
  const [enviando, definirEnviando] = useState(false);
  const [erro, definirErro] = useState("");
  const [mensagem, definirMensagem] = useState("");
  const [secao, definirSecao] =
    useState<(typeof secoes)[number]>("Visão geral");

  function trocarFormulario() {
    definirCadastro(!cadastro);
    definirSenha("");
    definirMostrarSenha(false);
    definirErro("");
    definirMensagem("");
  }
  async function enviar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    if (enviando) return;
    definirEnviando(true);
    definirErro("");
    definirMensagem("");
    try {
      if (cadastro) {
        await cadastrarLojista({
          nome: nome.trim(),
          email: email.trim(),
          senha,
        });
        definirCadastro(false);
        definirNome("");
        definirMensagem("Conta criada. Entre com seu e-mail e senha.");
      } else {
        definirUsuario(await entrar({ email: email.trim(), senha }));
        definirEmail("");
        definirNome("");
        definirSecao("Visão geral");
      }
    } catch (falha) {
      definirErro(
        falha instanceof Error
          ? falha.message
          : "Não foi possível concluir. Tente novamente.",
      );
    } finally {
      definirSenha("");
      definirMostrarSenha(false);
      definirEnviando(false);
    }
  }
  function encerrarSessao() {
    sair();
    definirUsuario(null);
    definirSenha("");
    definirErro("");
    definirMensagem("");
    definirSecao("Visão geral");
  }

  // O checkout público tem prioridade mesmo quando existe uma sessão administrativa.
  if (caminho === "/checkout" || caminho.startsWith("/checkout/")) {
    const identificador = caminho.match(/^\/checkout\/([^/]+)\/?$/)?.[1] ?? "";
    return (
      <CheckoutPublico key={identificador} identificador={identificador} />
    );
  }

  if (usuario) {
    const iniciais = usuario.nome
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((parte) => parte[0])
      .join("")
      .toUpperCase();
    return (
      <div className="area-lojista">
        <aside className="menu-lateral">
          <Marca />
          <p className="legenda-menu">MENU PRINCIPAL</p>
          <nav aria-label="Menu principal">
            {secoes.map((item, indice) => (
              <button
                key={item}
                type="button"
                className={`item-menu ${secao === item ? "ativo" : ""}`}
                aria-current={secao === item ? "page" : undefined}
                onClick={() => definirSecao(item)}
              >
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path d={icones[indice]} />
                </svg>
                {item}
              </button>
            ))}
          </nav>
          <div className="usuario-lateral">
            <span className="avatar" aria-hidden="true">
              {iniciais}
            </span>
            <div>
              <strong>{usuario.nome}</strong>
              <span>{usuario.email}</span>
            </div>
          </div>
        </aside>
        <div className="conteudo-lojista">
          <header className="cabecalho">
            <span>{secao}</span>
            <button
              className="botao-sair"
              type="button"
              onClick={encerrarSessao}
            >
              Sair <span aria-hidden="true">↗</span>
            </button>
          </header>
          <main className="pagina-lojista">
            <p className="sobretitulo">SUA CONTA NEXORA</p>
            <h1>{secao === "Visão geral" ? `Olá, ${usuario.nome}.` : secao}</h1>
            <p className="descricao-pagina">
              {secao === "Visão geral"
                ? "Bem-vindo ao seu espaço de pagamentos."
                : secao === "Links de pagamento"
                  ? "Crie e acompanhe seus checkouts em um só lugar."
                  : secao === "Transações"
                    ? "Consulte os pedidos e as transações registrados na sua conta."
                    : secao === "Carteira"
                      ? "Consulte o saldo e o extrato da sua conta vinculada."
                      : secao === "Saques"
                        ? "Acompanhe os registros locais de saques."
                        : "Administre as configurações de webhook da sua conta."}
            </p>
            {secao === "Links de pagamento" && <LinksPagamento />}
            {secao === "Transações" && <Transacoes />}
            {secao === "Carteira" && <Carteira />}
            {secao === "Saques" && <Saques />}
            {secao === "Webhooks" && <Webhooks />}
            {secao === "Visão geral" && (
              <section className="inicio-conta">
                <span className="inicio-simbolo" aria-hidden="true">
                  ϟ
                </span>
                <h2>Seu próximo passo começa aqui.</h2>
                <p>
                  Acesse seus links de pagamento e consulte os pedidos pelo
                  menu. A execução de Pix e cartão estará disponível em uma
                  próxima etapa.
                </p>
              </section>
            )}
          </main>
        </div>
      </div>
    );
  }

  return (
    <main className="tela-acesso">
      <section className="painel-institucional" aria-label="Nexora">
        <Marca />
        <div className="texto-institucional">
          <p className="sobretitulo">INFRAESTRUTURA PARA CRESCER</p>
          <h1>Pagamentos que acompanham o seu negócio.</h1>
          <p>
            Uma experiência simples para conectar sua operação ao próximo nível.
          </p>
        </div>
        <div className="grafico-abstrato" aria-hidden="true">
          <div className="orbita orbita-um" />
          <div className="orbita orbita-dois" />
          <div className="orbita orbita-tres" />
          <div className="cartao-abstrato">
            <span />
            <i />
          </div>
          <span className="ponto-orbita">ϟ</span>
        </div>
        <p className="rodape-institucional">
          Nexora · Pagamentos para a economia digital
        </p>
      </section>
      <section className="painel-formulario" aria-labelledby="titulo-acesso">
        <div className="formulario-acesso">
          <p className="sobretitulo">
            {cadastro ? "COMECE COM A NEXORA" : "BEM-VINDO DE VOLTA"}
          </p>
          <h2 id="titulo-acesso">
            {cadastro ? "Crie sua conta" : "Acesse sua conta"}
          </h2>
          <p className="descricao-acesso">
            {cadastro
              ? "Seu primeiro passo para organizar sua operação."
              : "Entre para acessar seu espaço Nexora."}
          </p>
          <form onSubmit={enviar} aria-busy={enviando}>
            <fieldset disabled={enviando}>
              {cadastro && (
                <div className="campo">
                  <label htmlFor="nome">Nome completo</label>
                  <input
                    id="nome"
                    name="nome"
                    autoComplete="name"
                    placeholder="Seu nome completo"
                    value={nome}
                    onChange={(evento) => definirNome(evento.target.value)}
                    minLength={2}
                    maxLength={150}
                    required
                  />
                </div>
              )}
              <div className="campo">
                <label htmlFor="email">E-mail</label>
                <input
                  id="email"
                  name="email"
                  type="email"
                  autoComplete="username"
                  placeholder="voce@exemplo.com.br"
                  value={email}
                  onChange={(evento) => definirEmail(evento.target.value)}
                  maxLength={254}
                  required
                />
              </div>
              <div className="campo">
                <label htmlFor="senha">Senha</label>
                <div className="entrada-senha">
                  <input
                    id="senha"
                    name="senha"
                    type={mostrarSenha ? "text" : "password"}
                    autoComplete={
                      cadastro ? "new-password" : "current-password"
                    }
                    placeholder={
                      cadastro ? "Crie uma senha" : "Digite sua senha"
                    }
                    value={senha}
                    onChange={(evento) => definirSenha(evento.target.value)}
                    minLength={cadastro ? 8 : 1}
                    maxLength={128}
                    aria-describedby={cadastro ? "orientacao-senha" : undefined}
                    required
                  />
                  <button
                    type="button"
                    className="mostrar-senha"
                    aria-label={
                      mostrarSenha ? "Ocultar senha" : "Mostrar senha"
                    }
                    aria-pressed={mostrarSenha}
                    onClick={() => definirMostrarSenha(!mostrarSenha)}
                  >
                    <svg viewBox="0 0 24 24" aria-hidden="true">
                      <path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12Z" />
                      <circle cx="12" cy="12" r="3" />
                      {mostrarSenha && <path d="m3 3 18 18" />}
                    </svg>
                  </button>
                </div>
                {cadastro && (
                  <small id="orientacao-senha">
                    Use pelo menos 8 caracteres.
                  </small>
                )}
              </div>
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
              <button className="botao-principal" type="submit">
                {enviando
                  ? "Aguarde…"
                  : cadastro
                    ? "Criar minha conta"
                    : "Entrar"}
                <span aria-hidden="true">↗</span>
              </button>
            </fieldset>
          </form>
          <p className="trocar-acesso">
            {cadastro
              ? "Já possui uma conta? "
              : "Ainda não possui uma conta? "}
            <button
              type="button"
              disabled={enviando}
              onClick={trocarFormulario}
            >
              {cadastro ? "Voltar ao login" : "Criar conta"}
            </button>
          </p>
        </div>
      </section>
    </main>
  );
}
export default App;
