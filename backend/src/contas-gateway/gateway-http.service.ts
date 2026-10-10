import {
  BadGatewayException,
  GatewayTimeoutException,
  HttpException,
  Injectable,
  type OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type {
  MetodoHttpGateway,
  OpcoesRequisicaoGateway,
} from './tipos/contrato-gateway';

@Injectable()
export class GatewayHttpService implements OnModuleInit {
  private enderecoBase: URL;
  private timeoutMs: number;

  constructor(private readonly configuracao: ConfigService) {}

  onModuleInit(): void {
    const endereco = this.configuracao.get<string>('GATEWAY_BASE_URL');
    try {
      if (!endereco) throw new Error();
      const base = new URL(endereco);
      if (
        base.protocol !== 'https:' ||
        base.username ||
        base.password ||
        base.search ||
        base.hash ||
        !['/', '/api', '/api/'].includes(base.pathname)
      )
        throw new Error();
      base.pathname = '/api/';
      this.enderecoBase = base;
    } catch {
      throw new Error(
        'GATEWAY_BASE_URL deve ser uma URL HTTPS sem credenciais, com caminho raiz ou /api.',
      );
    }

    const timeout = this.configuracao.get<string>(
      'GATEWAY_TIMEOUT_MS',
      '10000',
    );
    this.timeoutMs = Number(timeout);
    if (
      !/^\d+$/.test(timeout) ||
      !Number.isSafeInteger(this.timeoutMs) ||
      this.timeoutMs <= 0 ||
      this.timeoutMs > 2147483647
    ) {
      throw new Error(
        'GATEWAY_TIMEOUT_MS deve ser um inteiro positivo compatível com o temporizador.',
      );
    }
  }

  async requisitar<T>(
    metodo: MetodoHttpGateway,
    caminho: string,
    opcoes: OpcoesRequisicaoGateway = {},
  ): Promise<T | null> {
    if (!this.enderecoBase) this.onModuleInit();
    if (
      !caminho.startsWith('/') ||
      caminho.startsWith('//') ||
      caminho.includes('\\')
    ) {
      throw new BadGatewayException('Caminho inválido para o gateway.');
    }
    const endereco = new URL(caminho.slice(1), this.enderecoBase);
    if (
      endereco.origin !== this.enderecoBase.origin ||
      !endereco.pathname.startsWith('/api/') ||
      endereco.hash
    ) {
      throw new BadGatewayException('Caminho inválido para o gateway.');
    }
    if (metodo === 'GET' && opcoes.corpo !== undefined) {
      throw new BadGatewayException('Consultas ao gateway não aceitam body.');
    }
    if (opcoes.token !== undefined && !/^\S+$/.test(opcoes.token)) {
      throw new BadGatewayException('Token de acesso ao gateway inválido.');
    }

    const cabecalhos: Record<string, string> = { Accept: 'application/json' };
    if (opcoes.corpo !== undefined)
      cabecalhos['Content-Type'] = 'application/json';
    if (opcoes.token !== undefined)
      cabecalhos.Authorization = `Bearer ${opcoes.token}`;

    const cancelamento = new AbortController();
    const temporizador = setTimeout(() => cancelamento.abort(), this.timeoutMs);
    try {
      // Não segue redirects nem repete operações que podem criar cobranças ou saques.
      const resposta = await fetch(endereco, {
        method: metodo,
        headers: cabecalhos,
        body:
          opcoes.corpo === undefined ? undefined : JSON.stringify(opcoes.corpo),
        signal: cancelamento.signal,
        redirect: 'error',
      });
      if (!resposta.ok) {
        // Preserva o status de origem, mas não repassa mensagens ou payloads potencialmente sensíveis.
        throw new BadGatewayException({
          message: 'O gateway recusou a requisição.',
          statusGateway: resposta.status,
        });
      }
      if (resposta.status === 204) return null;
      const conteudo = await resposta.text();
      return conteudo.trim() ? (JSON.parse(conteudo) as T) : null;
    } catch (erro) {
      if (cancelamento.signal.aborted) {
        throw new GatewayTimeoutException(
          'O gateway não respondeu no prazo configurado.',
        );
      }
      if (erro instanceof HttpException) throw erro;
      throw new BadGatewayException(
        'Não foi possível obter uma resposta válida do gateway.',
      );
    } finally {
      clearTimeout(temporizador);
    }
  }
}
