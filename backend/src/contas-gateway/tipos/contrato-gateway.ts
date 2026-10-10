// Os nomes externos seguem o contrato do gateway; a aplicação usa nomes próprios em português.
export interface LoginGateway {
  document: string;
  password: string;
}

export interface UsuarioLoginGateway {
  id: string;
  personType: 'PF' | 'PJ';
  name: string;
  tradingName: string | null;
  email: string;
  document: string;
}

export interface RetornoLoginGateway {
  access_token: string;
  token_type: string;
  codigoCliente: number;
  chaveLoja: string;
  user: UsuarioLoginGateway;
}

export interface PerfilGateway extends UsuarioLoginGateway {
  phone: string;
  codigoCliente: number;
  chaveLoja: string;
  address: {
    zipCode: string;
    address: string;
    number: string;
    complement: string | null;
    neighborhood: string;
    city: string;
    state: string;
  };
  emailConfirmed: boolean;
  wallet: { id: string; balance: number; balanceFormatted: string };
  createdAt: string;
}

export type MetodoHttpGateway = 'GET' | 'POST' | 'DELETE';

export interface OpcoesRequisicaoGateway {
  token?: string;
  corpo?: unknown;
}
