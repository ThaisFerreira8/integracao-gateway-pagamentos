// Os campos externos preservam os nomes publicados pelo gateway.
export type BandeiraGateway = 'VISA' | 'MASTERCARD' | 'ELO';

export interface TaxaGateway {
  id: string;
  brand: BandeiraGateway;
  installments: number;
  feePercent: number;
  feePercentFormatted: string;
}

export interface RetornoTaxasGateway {
  total: number;
  fees: TaxaGateway[];
}

// Contratos de entrada publicados; respostas observadas são validadas em contrato-transacao-gateway.
export interface PagamentoPixGateway {
  amount: number;
  payerDocument: string;
  externalReference: string;
  description?: string;
}

export interface PagamentoCartaoGateway {
  amount: number;
  externalReference: string;
  cardNumber: string;
  cardHolder: string;
  expiryMonth: string;
  expiryYear: string;
  cvv: string;
  installments: number;
  feePercent: number;
  description?: string;
}
