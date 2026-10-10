export interface UsuarioSessao {
  id: string;
  nome: string;
  email: string;
}
let tokenSessao: string | null = null;

async function requisitar(
  caminho: string,
  corpo?: unknown,
  autenticada = true,
  metodo?: "GET" | "POST" | "DELETE",
): Promise<unknown> {
  const enderecoConfigurado = import.meta.env.VITE_API_URL;
  if (typeof enderecoConfigurado !== "string" || !enderecoConfigurado.trim()) {
    throw new Error(
      "Configuração ausente: defina VITE_API_URL para acessar o backend.",
    );
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
  if (autenticada && !tokenSessao) {
    throw new Error("Sua sessão terminou. Entre novamente.");
  }
  try {
    resposta = await fetch(`${base.href.replace(/\/$/, "")}${caminho}`, {
      method: metodo ?? (corpo === undefined ? "GET" : "POST"),
      headers: {
        Accept: "application/json",
        ...(corpo === undefined ? {} : { "Content-Type": "application/json" }),
        ...(autenticada ? { Authorization: `Bearer ${tokenSessao}` } : {}),
      },
      body: corpo === undefined ? undefined : JSON.stringify(corpo),
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
      401: autenticada
        ? "Sua sessão terminou. Entre novamente."
        : "E-mail ou senha inválidos.",
      404: "Registro não encontrado.",
      409:
        caminho === "/autenticacao/cadastro"
          ? "Este e-mail já possui uma conta. Entre com seu acesso."
          : "Não foi possível concluir devido ao estado atual do registro.",
      429: "Muitas tentativas. Aguarde e tente novamente.",
    };
    // Não reproduz corpos de erro que possam conter dados internos.
    throw new Error(
      mensagens[resposta.status] ||
        "Não foi possível concluir. Tente novamente em instantes.",
    );
  }
  // Operações administrativas sem conteúdo não têm contrato de corpo de resposta.
  if (resposta.status === 204) return undefined;
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
  const retorno = await requisitar("/autenticacao/cadastro", entrada, false);
  if (!usuarioValido(retorno))
    throw new Error("A aplicação retornou uma resposta inesperada.");
}
export async function entrar(entrada: {
  email: string;
  senha: string;
}): Promise<UsuarioSessao> {
  tokenSessao = null;
  const retorno = await requisitar("/autenticacao/login", entrada, false);
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

export interface ResultadoPagamento {
  identificadorPagamento: string;
  estado: EstadoExtrato;
  valorCentavos: number;
  emv?: string | null;
  qrCodeBase64?: string | null;
}
export async function pagarCheckout(
  identificador: string,
  metodo: MetodoPagamento,
  entrada: Record<string, string | number>,
): Promise<ResultadoPagamento> {
  if (!identificadorValido(identificador) || !metodoValido(metodo))
    throw new Error("Checkout inválido.");
  const corpo =
    metodo === "PIX"
      ? { documentoPagador: entrada.documentoPagador }
      : {
          bandeira: entrada.bandeira,
          parcelas: entrada.parcelas,
          numeroCartao: entrada.numeroCartao,
          titularCartao: entrada.titularCartao,
          mesValidade: entrada.mesValidade,
          anoValidade: entrada.anoValidade,
          codigoSeguranca: entrada.codigoSeguranca,
        };
  const retorno = await requisitar(
    "/checkout/" +
      encodeURIComponent(identificador) +
      (metodo === "PIX" ? "/pix" : "/cartao"),
    corpo,
    false,
  );
  if (
    !objeto(retorno) ||
    !texto(retorno.identificadorPagamento) ||
    typeof retorno.estado !== "string" ||
    !["PENDING", "APPROVED", "DENIED", "EXPIRED", "CANCELLED"].includes(
      retorno.estado,
    ) ||
    !inteiro(retorno.valorCentavos) ||
    !(
      retorno.emv === undefined ||
      retorno.emv === null ||
      texto(retorno.emv)
    ) ||
    !(
      retorno.qrCodeBase64 === undefined ||
      retorno.qrCodeBase64 === null ||
      texto(retorno.qrCodeBase64)
    )
  )
    throw inesperada();
  return {
    identificadorPagamento: retorno.identificadorPagamento,
    estado: retorno.estado as EstadoExtrato,
    valorCentavos: retorno.valorCentavos,
    ...(metodo === "PIX"
      ? {
          emv: retorno.emv as string | null,
          qrCodeBase64: retorno.qrCodeBase64 as string | null,
        }
      : {}),
  };
}

export type EstadoExtrato =
  "PENDING" | "APPROVED" | "DENIED" | "EXPIRED" | "CANCELLED";
export type TipoExtrato = "PIX" | "CREDIT_CARD" | "WITHDRAWAL";
export interface CarteiraLojista {
  balance: number;
  balanceFormatted: string;
  updatedAt: string;
}
export interface ExtratoLojista {
  balance: number;
  balanceFormatted: string;
  filters: { status: EstadoExtrato | null; type: TipoExtrato | null };
  transactions: ItemExtrato[];
}
export interface ItemExtrato {
  id: string;
  type: TipoExtrato;
  status: EstadoExtrato;
  amount: number;
  createdAt: string;
  externalReference: string | null;
}
export interface SaqueLocal {
  id: string;
  valorCentavos: number;
  referenciaExterna: string;
  estado: "PENDENTE" | "APROVADO" | "NEGADO";
  criadoEm: string;
  atualizadoEm: string;
}
export type EventoWebhook = "PAYMENT_PIX" | "PAYMENT_CARD" | "WITHDRAWAL";

const texto = (valor: unknown): valor is string =>
  typeof valor === "string" && !!valor.trim();
const numeroFinito = (valor: unknown): valor is number =>
  typeof valor === "number" && Number.isFinite(valor);

export async function consultarCarteira(): Promise<CarteiraLojista> {
  const retorno = await requisitar("/carteira");
  if (
    !objeto(retorno) ||
    !texto(retorno.id) ||
    !texto(retorno.userId) ||
    !numeroFinito(retorno.balance) ||
    !texto(retorno.balanceFormatted) ||
    !dataValida(retorno.updatedAt)
  )
    throw inesperada();
  // A tela usa o saldo formatado; não interpreta a unidade do número bruto.
  return {
    balance: retorno.balance,
    balanceFormatted: retorno.balanceFormatted,
    updatedAt: retorno.updatedAt,
  };
}

export async function consultarExtrato(
  consulta: {
    status?: EstadoExtrato;
    type?: TipoExtrato;
    limit?: number;
  } = {},
): Promise<ExtratoLojista> {
  if (
    (consulta.status !== undefined &&
      !["PENDING", "APPROVED", "DENIED", "EXPIRED", "CANCELLED"].includes(
        consulta.status,
      )) ||
    (consulta.type !== undefined &&
      !["PIX", "CREDIT_CARD", "WITHDRAWAL"].includes(consulta.type)) ||
    (consulta.limit !== undefined &&
      (!inteiro(consulta.limit) || consulta.limit < 1))
  ) {
    throw new Error("Confira os filtros e informe um limite inteiro positivo.");
  }
  const parametros = new URLSearchParams();
  if (consulta.status) parametros.set("status", consulta.status);
  if (consulta.type) parametros.set("type", consulta.type);
  if (consulta.limit !== undefined)
    parametros.set("limit", String(consulta.limit));
  const retorno = await requisitar(
    "/carteira/extrato" + (parametros.size ? "?" + parametros.toString() : ""),
  );
  if (
    !objeto(retorno) ||
    !texto(retorno.walletId) ||
    !numeroFinito(retorno.balance) ||
    !texto(retorno.balanceFormatted) ||
    !objeto(retorno.filters) ||
    retorno.filters.status !== (consulta.status ?? null) ||
    retorno.filters.type !== (consulta.type ?? null) ||
    !Array.isArray(retorno.transactions)
  )
    throw inesperada();
  return {
    balance: retorno.balance,
    balanceFormatted: retorno.balanceFormatted,
    filters: { status: consulta.status ?? null, type: consulta.type ?? null },
    transactions: retorno.transactions.map((item: unknown) => {
      if (
        !objeto(item) ||
        !texto(item.id) ||
        typeof item.type !== "string" ||
        !["PIX", "CREDIT_CARD", "WITHDRAWAL"].includes(item.type) ||
        typeof item.status !== "string" ||
        !["PENDING", "APPROVED", "DENIED", "EXPIRED", "CANCELLED"].includes(
          item.status,
        ) ||
        !inteiro(item.amount) ||
        !dataValida(item.createdAt) ||
        !(item.externalReference === null || texto(item.externalReference))
      )
        throw inesperada();
      return {
        id: item.id,
        type: item.type as TipoExtrato,
        status: item.status as EstadoExtrato,
        amount: item.amount,
        createdAt: item.createdAt,
        externalReference: item.externalReference,
      };
    }),
  };
}

function lerSaque(valor: unknown): SaqueLocal {
  if (
    !objeto(valor) ||
    !identificadorValido(valor.id) ||
    !inteiro(valor.valorCentavos) ||
    !texto(valor.referenciaExterna) ||
    typeof valor.estado !== "string" ||
    !["PENDENTE", "APROVADO", "NEGADO"].includes(valor.estado) ||
    !dataValida(valor.criadoEm) ||
    !dataValida(valor.atualizadoEm)
  )
    throw inesperada();
  return {
    id: valor.id,
    valorCentavos: valor.valorCentavos,
    referenciaExterna: valor.referenciaExterna,
    estado: valor.estado as SaqueLocal["estado"],
    criadoEm: valor.criadoEm,
    atualizadoEm: valor.atualizadoEm,
  };
}

export async function listarSaques(): Promise<SaqueLocal[]> {
  const retorno = await requisitar("/saques");
  if (!Array.isArray(retorno)) throw inesperada();
  return retorno.map(lerSaque);
}

export async function consultarSaque(id: string): Promise<SaqueLocal> {
  if (!identificadorValido(id))
    throw new Error("Identificador local de saque inválido.");
  const saque = lerSaque(await requisitar("/saques/" + encodeURIComponent(id)));
  if (saque.id !== id) throw inesperada();
  return saque;
}

export async function listarWebhooks(): Promise<never[]> {
  const retorno = await requisitar("/webhooks");
  if (!Array.isArray(retorno) || retorno.length !== 0) throw inesperada();
  return [];
}

export async function configurarWebhook(entrada: {
  event: EventoWebhook;
  url: string;
  secret?: string;
}): Promise<void> {
  let destino: URL;
  try {
    destino = new URL(entrada.url);
  } catch {
    throw new Error("Informe uma URL HTTPS válida.");
  }
  if (
    destino.protocol !== "https:" ||
    destino.username ||
    destino.password ||
    !["PAYMENT_PIX", "PAYMENT_CARD", "WITHDRAWAL"].includes(entrada.event) ||
    (entrada.secret !== undefined && !texto(entrada.secret))
  )
    throw new Error("Confira o evento, a URL HTTPS e o secret opcional.");
  const retorno = await requisitar("/webhooks", {
    event: entrada.event,
    url: entrada.url,
    ...(entrada.secret === undefined ? {} : { secret: entrada.secret }),
  });
  if (retorno !== undefined) throw inesperada();
}

export async function removerWebhook(id: string): Promise<void> {
  if (
    !id.trim() ||
    id === "." ||
    id === ".." ||
    id.includes("/") ||
    id.includes("\\") ||
    [...id].some(
      (caractere) =>
        caractere.charCodeAt(0) < 32 || caractere.charCodeAt(0) === 127,
    )
  ) {
    throw new Error(
      "Informe um identificador que represente um único segmento de URL.",
    );
  }
  let segmento: string;
  try {
    segmento = encodeURIComponent(id);
  } catch {
    throw new Error("Identificador inválido.");
  }
  const retorno = await requisitar(
    "/webhooks/" + segmento,
    undefined,
    true,
    "DELETE",
  );
  if (retorno !== undefined) throw inesperada();
}

export type MetodoPagamento = "PIX" | "CARTAO";
export type EstadoLink = "ATIVO" | "PAGO" | "EXPIRADO" | "CANCELADO";
export type FiltroPagamento = "APPROVED" | "DENIED" | "EXPIRED" | "CANCELLED";
export interface TaxaDisponivel {
  bandeira: "VISA" | "MASTERCARD" | "ELO";
  parcelas: number;
  taxaPercentual: number;
}
export interface LinkPagamento {
  identificadorPublico: string;
  valorCentavos: number;
  metodo: MetodoPagamento;
  parcelas: number | null;
  bandeira: string | null;
  taxaAplicadaPercentual: string | null;
  estado: EstadoLink;
  expiraEm: string;
}
export interface CheckoutPublico extends LinkPagamento {
  taxas?: TaxaDisponivel[];
}
export interface TransacaoLocal {
  id: string;
  tipo: MetodoPagamento;
  estado: "PENDENTE" | "APROVADA" | "NEGADA" | "EXPIRADA" | "CANCELADA";
  valorCentavos: number;
  taxaCentavos: number | null;
  valorLiquidoCentavos: number | null;
  criadoEm: string;
}
export interface PedidoLocal {
  id: string;
  referenciaExterna: string;
  estadoPedido: "PENDENTE" | "APROVADO" | "NEGADO";
  criadoEm: string;
  atualizadoEm: string;
  checkout: {
    identificadorPublico: string;
    valorCentavos: number;
    metodo: MetodoPagamento;
    estadoLink: EstadoLink;
  };
  transacoes: TransacaoLocal[];
}
export interface PaginaPedidos {
  dados: PedidoLocal[];
  pagina: number;
  limite: number;
  total: number;
  totalPaginas: number;
}

const identificadorValido = (valor: unknown): valor is string =>
  typeof valor === "string" &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(valor);
const inteiro = (valor: unknown): valor is number =>
  typeof valor === "number" && Number.isSafeInteger(valor) && valor >= 0;
const dataValida = (valor: unknown): valor is string =>
  typeof valor === "string" && Number.isFinite(Date.parse(valor));
const metodoValido = (valor: unknown): valor is MetodoPagamento =>
  valor === "PIX" || valor === "CARTAO";
const estadoLinkValido = (valor: unknown): valor is EstadoLink =>
  typeof valor === "string" &&
  ["ATIVO", "PAGO", "EXPIRADO", "CANCELADO"].includes(valor);
const inesperada = () =>
  new Error("A aplicação retornou uma resposta inesperada.");

export function reaisParaCentavos(valor: string): number {
  const entrada = valor.trim();
  if (!/^\d+(?:[,.]\d{1,2})?$/.test(entrada)) {
    throw new Error(
      "Informe o valor com até duas casas decimais, sem separador de milhar.",
    );
  }
  // Junta os dígitos para evitar arredondamento de ponto flutuante na entrada.
  const [reais, fracao = ""] = entrada.replace(",", ".").split(".");
  const centavos = Number(reais + fracao.padEnd(2, "0"));
  if (
    !Number.isSafeInteger(centavos) ||
    centavos < 1 ||
    centavos > 4294967295
  ) {
    throw new Error("Informe um valor entre R$ 0,01 e R$ 42.949.672,95.");
  }
  return centavos;
}

function lerLink(valor: unknown): LinkPagamento {
  if (
    !objeto(valor) ||
    !identificadorValido(valor.identificadorPublico) ||
    !inteiro(valor.valorCentavos) ||
    valor.valorCentavos < 1 ||
    !metodoValido(valor.metodo) ||
    !estadoLinkValido(valor.estado) ||
    !dataValida(valor.expiraEm) ||
    !(
      valor.parcelas === null ||
      (inteiro(valor.parcelas) && valor.parcelas >= 1 && valor.parcelas <= 21)
    ) ||
    !(valor.bandeira === null || typeof valor.bandeira === "string") ||
    !(
      valor.taxaAplicadaPercentual === null ||
      (typeof valor.taxaAplicadaPercentual === "string" &&
        /^\d+(?:\.\d{1,4})?$/.test(valor.taxaAplicadaPercentual) &&
        Number(valor.taxaAplicadaPercentual) <= 100)
    )
  )
    throw inesperada();
  return {
    identificadorPublico: valor.identificadorPublico,
    valorCentavos: valor.valorCentavos,
    metodo: valor.metodo,
    parcelas: valor.parcelas,
    bandeira: valor.bandeira,
    taxaAplicadaPercentual: valor.taxaAplicadaPercentual,
    estado: valor.estado,
    expiraEm: valor.expiraEm,
  };
}

function lerTaxas(valor: unknown): TaxaDisponivel[] {
  if (!Array.isArray(valor)) throw inesperada();
  return valor.map((taxa: unknown) => {
    if (
      !objeto(taxa) ||
      typeof taxa.bandeira !== "string" ||
      !["VISA", "MASTERCARD", "ELO"].includes(taxa.bandeira) ||
      !inteiro(taxa.parcelas) ||
      taxa.parcelas < 1 ||
      taxa.parcelas > 21 ||
      typeof taxa.taxaPercentual !== "number" ||
      !Number.isFinite(taxa.taxaPercentual) ||
      taxa.taxaPercentual < 0 ||
      taxa.taxaPercentual > 100
    )
      throw inesperada();
    return {
      bandeira: taxa.bandeira as TaxaDisponivel["bandeira"],
      parcelas: taxa.parcelas,
      taxaPercentual: taxa.taxaPercentual,
    };
  });
}

export async function listarLinks(): Promise<LinkPagamento[]> {
  const retorno = await requisitar("/checkouts");
  if (!Array.isArray(retorno)) throw inesperada();
  return retorno.map(lerLink);
}

export async function criarLink(entrada: {
  valorCentavos: number;
  metodo: MetodoPagamento;
  expiraEm: string;
  bandeira?: TaxaDisponivel["bandeira"];
  parcelas?: number;
}): Promise<LinkPagamento> {
  if (
    !inteiro(entrada.valorCentavos) ||
    entrada.valorCentavos < 1 ||
    entrada.valorCentavos > 4294967295 ||
    !metodoValido(entrada.metodo) ||
    !dataValida(entrada.expiraEm) ||
    Date.parse(entrada.expiraEm) <= Date.now()
  ) {
    throw new Error("Confira o valor, o método e a data futura de expiração.");
  }
  return lerLink(
    await requisitar("/checkouts", {
      valorCentavos: entrada.valorCentavos,
      metodo: entrada.metodo,
      expiraEm: entrada.expiraEm,
      ...(entrada.metodo === "CARTAO"
        ? { bandeira: entrada.bandeira, parcelas: entrada.parcelas }
        : {}),
    }),
  );
}

export async function solicitarSaque(entrada: {
  valorCentavos: number;
  chavePix: string;
  documentoTitular: string;
  descricao?: string;
}): Promise<SaqueLocal> {
  if (
    !inteiro(entrada.valorCentavos) ||
    entrada.valorCentavos < 1 ||
    entrada.valorCentavos > 4294967295 ||
    !entrada.chavePix.trim() ||
    entrada.chavePix.length > 254 ||
    !/^\d{11}$/.test(entrada.documentoTitular) ||
    (entrada.descricao !== undefined && entrada.descricao.length > 255)
  )
    throw new Error("Confira o valor, a chave Pix, o CPF e a descrição.");
  return lerSaque(
    await requisitar("/saques", {
      valorCentavos: entrada.valorCentavos,
      chavePix: entrada.chavePix,
      documentoTitular: entrada.documentoTitular,
      ...(entrada.descricao ? { descricao: entrada.descricao } : {}),
    }),
  );
}

export async function conciliarSaque(id: string): Promise<SaqueLocal> {
  if (!identificadorValido(id)) throw inesperada();
  const saque = lerSaque(
    await requisitar(
      "/saques/" + encodeURIComponent(id) + "/conciliar",
      undefined,
      true,
      "POST",
    ),
  );
  if (saque.id !== id) throw inesperada();
  return saque;
}

export async function consultarTaxas(
  bandeira?: TaxaDisponivel["bandeira"],
): Promise<TaxaDisponivel[]> {
  if (
    bandeira !== undefined &&
    !["VISA", "MASTERCARD", "ELO"].includes(bandeira)
  ) {
    throw new Error("Bandeira inválida.");
  }
  const retorno = await requisitar(
    "/checkouts/taxas" +
      (bandeira ? "?bandeira=" + encodeURIComponent(bandeira) : ""),
  );
  if (!objeto(retorno) || !inteiro(retorno.total)) throw inesperada();
  const taxas = lerTaxas(retorno.taxas);
  if (
    retorno.total !== taxas.length ||
    (bandeira && taxas.some((taxa) => taxa.bandeira !== bandeira))
  )
    throw inesperada();
  return taxas;
}

export async function consultarCheckout(
  identificador: string,
): Promise<CheckoutPublico> {
  if (!identificadorValido(identificador))
    throw new Error("O identificador deste link é inválido.");
  // A consulta pública nunca herda o Bearer da sessão administrativa.
  const retorno = await requisitar(
    "/checkout/" + encodeURIComponent(identificador),
    undefined,
    false,
  );
  const link = lerLink(retorno);
  if (link.identificadorPublico !== identificador || !objeto(retorno))
    throw inesperada();
  return {
    ...link,
    ...(retorno.taxas === undefined ? {} : { taxas: lerTaxas(retorno.taxas) }),
  };
}

function lerTransacao(valor: unknown): TransacaoLocal {
  if (
    !objeto(valor) ||
    !identificadorValido(valor.id) ||
    !metodoValido(valor.tipo) ||
    typeof valor.estado !== "string" ||
    !["PENDENTE", "APROVADA", "NEGADA", "EXPIRADA", "CANCELADA"].includes(
      valor.estado,
    ) ||
    !inteiro(valor.valorCentavos) ||
    !dataValida(valor.criadoEm) ||
    !(valor.taxaCentavos === null || inteiro(valor.taxaCentavos)) ||
    !(
      valor.valorLiquidoCentavos === null || inteiro(valor.valorLiquidoCentavos)
    )
  )
    throw inesperada();
  return {
    id: valor.id,
    tipo: valor.tipo,
    estado: valor.estado as TransacaoLocal["estado"],
    valorCentavos: valor.valorCentavos,
    taxaCentavos: valor.taxaCentavos,
    valorLiquidoCentavos: valor.valorLiquidoCentavos,
    criadoEm: valor.criadoEm,
  };
}

function lerPedido(valor: unknown): PedidoLocal {
  if (
    !objeto(valor) ||
    !identificadorValido(valor.id) ||
    typeof valor.referenciaExterna !== "string" ||
    !valor.referenciaExterna ||
    typeof valor.estadoPedido !== "string" ||
    !["PENDENTE", "APROVADO", "NEGADO"].includes(valor.estadoPedido) ||
    !dataValida(valor.criadoEm) ||
    !dataValida(valor.atualizadoEm) ||
    !objeto(valor.checkout) ||
    !identificadorValido(valor.checkout.identificadorPublico) ||
    !inteiro(valor.checkout.valorCentavos) ||
    !metodoValido(valor.checkout.metodo) ||
    !estadoLinkValido(valor.checkout.estadoLink) ||
    !Array.isArray(valor.transacoes)
  )
    throw inesperada();
  return {
    id: valor.id,
    referenciaExterna: valor.referenciaExterna,
    estadoPedido: valor.estadoPedido as PedidoLocal["estadoPedido"],
    criadoEm: valor.criadoEm,
    atualizadoEm: valor.atualizadoEm,
    checkout: {
      identificadorPublico: valor.checkout.identificadorPublico,
      valorCentavos: valor.checkout.valorCentavos,
      metodo: valor.checkout.metodo,
      estadoLink: valor.checkout.estadoLink,
    },
    transacoes: valor.transacoes.map(lerTransacao),
  };
}

export async function listarPedidos(consulta: {
  pagina: number;
  limite: number;
  status?: FiltroPagamento;
  referenciaExterna?: string;
}): Promise<PaginaPedidos> {
  if (
    !inteiro(consulta.pagina) ||
    consulta.pagina < 1 ||
    consulta.pagina > 100000 ||
    !inteiro(consulta.limite) ||
    consulta.limite < 1 ||
    consulta.limite > 100 ||
    (consulta.status !== undefined &&
      !["APPROVED", "DENIED", "EXPIRED", "CANCELLED"].includes(
        consulta.status,
      )) ||
    (consulta.referenciaExterna !== undefined &&
      (!consulta.referenciaExterna.trim() ||
        consulta.referenciaExterna.length > 100))
  ) {
    throw new Error("Confira os filtros e a paginação.");
  }
  const parametros = new URLSearchParams({
    pagina: String(consulta.pagina),
    limite: String(consulta.limite),
  });
  if (consulta.status) parametros.set("status", consulta.status);
  if (consulta.referenciaExterna)
    parametros.set("referenciaExterna", consulta.referenciaExterna.trim());
  const retorno = await requisitar("/pagamentos?" + parametros.toString());
  if (
    !objeto(retorno) ||
    !Array.isArray(retorno.dados) ||
    retorno.pagina !== consulta.pagina ||
    retorno.limite !== consulta.limite ||
    !inteiro(retorno.total) ||
    !inteiro(retorno.totalPaginas) ||
    retorno.totalPaginas !== Math.ceil(retorno.total / consulta.limite) ||
    retorno.dados.length > consulta.limite
  )
    throw inesperada();
  return {
    dados: retorno.dados.map(lerPedido),
    pagina: consulta.pagina,
    limite: consulta.limite,
    total: retorno.total,
    totalPaginas: retorno.totalPaginas,
  };
}
