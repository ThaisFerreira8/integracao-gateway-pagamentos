export interface UsuarioSessao {
  id: string;
  nome: string;
  email: string;
}
let tokenSessao: string | null = null;

async function requisitar(caminho: string, corpo: unknown): Promise<unknown> {
  const enderecoConfigurado = import.meta.env.VITE_API_URL;
  if (typeof enderecoConfigurado !== "string" || !enderecoConfigurado.trim()) {
    throw new Error("Configuração ausente: defina VITE_API_URL para acessar o backend.");
  }

  let base: URL;
  try {
    base = new URL(enderecoConfigurado.trim());
    const local = ["localhost", "127.0.0.1", "[::1]"].includes(base.hostname);
    if (
      (base.protocol !== "https:" && !(base.protocol === "http:" && local)) ||
      base.username ||
      base.password ||
      base.search ||
      base.hash
    )
      throw new Error();
  } catch {
    throw new Error(
      "Configuração inválida: VITE_API_URL deve ser uma URL HTTPS sem credenciais, query ou fragmento. HTTP é permitido somente para localhost, 127.0.0.1 ou ::1.",
    );
  }

  let resposta: Response;
  try {
    resposta = await fetch(`${base.href.replace(/\/$/, "")}${caminho}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(tokenSessao ? { Authorization: `Bearer ${tokenSessao}` } : {}),
      },
      body: JSON.stringify(corpo),
      credentials: "omit",
      redirect: "error",
      signal: AbortSignal.timeout(15000),
    });
  } catch {
    throw new Error(
      "Não foi possível conectar. Verifique se a aplicação está disponível e tente novamente.",
    );
  }
  if (!resposta.ok) {
    const mensagens: Record<number, string> = {
      400: "Confira os dados informados e tente novamente.",
      401: "E-mail ou senha inválidos.",
      409: "Este e-mail já possui uma conta. Entre com seu acesso.",
      429: "Muitas tentativas. Aguarde e tente novamente.",
    };
    // Não reproduz corpos de erro que possam conter dados internos.
    throw new Error(
      mensagens[resposta.status] ||
        "Não foi possível concluir. Tente novamente em instantes.",
    );
  }
  try {
    return (await resposta.json()) as unknown;
  } catch {
    throw new Error("A aplicação retornou uma resposta inesperada.");
  }
}

function objeto(valor: unknown): valor is Record<string, unknown> {
  return typeof valor === "object" && valor !== null && !Array.isArray(valor);
}
function usuarioValido(valor: unknown): valor is UsuarioSessao {
  return (
    objeto(valor) &&
    typeof valor.id === "string" &&
    !!valor.id &&
    typeof valor.nome === "string" &&
    !!valor.nome &&
    typeof valor.email === "string" &&
    !!valor.email
  );
}
export async function cadastrarLojista(entrada: {
  nome: string;
  email: string;
  senha: string;
}): Promise<void> {
  const retorno = await requisitar("/autenticacao/cadastro", entrada);
  if (!usuarioValido(retorno))
    throw new Error("A aplicação retornou uma resposta inesperada.");
}
export async function entrar(entrada: {
  email: string;
  senha: string;
}): Promise<UsuarioSessao> {
  tokenSessao = null;
  const retorno = await requisitar("/autenticacao/login", entrada);
  if (
    !objeto(retorno) ||
    typeof retorno.tokenAcesso !== "string" ||
    !/^\S+$/.test(retorno.tokenAcesso) ||
    retorno.tipoToken !== "Bearer" ||
    !usuarioValido(retorno.usuario)
  )
    throw new Error("A aplicação retornou uma resposta inesperada.");
  // Sessão somente em memória; nenhuma credencial é persistida no navegador.
  tokenSessao = retorno.tokenAcesso;
  return {
    id: retorno.usuario.id,
    nome: retorno.usuario.nome,
    email: retorno.usuario.email,
  };
}
export function sair(): void {
  tokenSessao = null;
}
