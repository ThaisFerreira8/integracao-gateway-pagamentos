import { BadGatewayException } from '@nestjs/common';

const objeto = (valor: unknown): valor is Record<string, unknown> =>
  typeof valor === 'object' && valor !== null && !Array.isArray(valor);
const texto = (valor: unknown): valor is string =>
  typeof valor === 'string' && !!valor.trim();
const centavos = (valor: unknown): valor is number =>
  typeof valor === 'number' &&
  Number.isSafeInteger(valor) &&
  valor >= 0 &&
  valor <= 4294967295;

// Campos observados em criação, consulta individual e extrato do simulador.
export function lerTransacaoGateway(valor: unknown) {
  if (
    !objeto(valor) ||
    !texto(valor.id) ||
    valor.id.length > 100 ||
    !['PIX', 'CREDIT_CARD', 'WITHDRAWAL'].includes(String(valor.type)) ||
    typeof valor.type !== 'string' ||
    typeof valor.status !== 'string' ||
    !['PENDING', 'APPROVED', 'DENIED', 'EXPIRED', 'CANCELLED'].includes(
      valor.status,
    ) ||
    !centavos(valor.amount) ||
    !texto(valor.createdAt) ||
    !Number.isFinite(Date.parse(valor.createdAt)) ||
    !objeto(valor.metadata)
  ) {
    throw new BadGatewayException(
      'Resposta financeira incompatível com o contrato observado.',
    );
  }
  const metadados = valor.metadata;
  if (
    valor.type === 'CREDIT_CARD' &&
    (typeof metadados.cardBrand !== 'string' ||
      !['VISA', 'MASTERCARD', 'ELO'].includes(metadados.cardBrand) ||
      typeof metadados.installments !== 'number' ||
      !Number.isInteger(metadados.installments) ||
      metadados.installments < 1 ||
      metadados.installments > 21 ||
      typeof metadados.feePercent !== 'number' ||
      !Number.isFinite(metadados.feePercent) ||
      metadados.feePercent < 0 ||
      metadados.feePercent > 100)
  )
    throw new BadGatewayException('Dados de taxa e parcelas incompatíveis.');
  if (
    metadados.externalReference !== undefined &&
    !texto(metadados.externalReference)
  ) {
    throw new BadGatewayException('Referência externa inválida.');
  }
  const referencia = texto(valor.externalReference)
    ? valor.externalReference
    : metadados.externalReference;
  if (
    texto(valor.externalReference) &&
    texto(metadados.externalReference) &&
    valor.externalReference !== metadados.externalReference
  ) {
    throw new BadGatewayException('Referências externas divergentes.');
  }
  for (const campo of ['feeAmountCents', 'netAmountCents']) {
    if (metadados[campo] !== undefined && !centavos(metadados[campo])) {
      throw new BadGatewayException('Valores financeiros inválidos.');
    }
  }
  const emv = valor.emv ?? metadados.emv;
  const qrCodeBase64 = valor.qrCodeBase64 ?? metadados.qrCodeBase64;
  if (
    (emv !== undefined && !texto(emv)) ||
    (qrCodeBase64 !== undefined && !texto(qrCodeBase64))
  ) {
    throw new BadGatewayException('Dados Pix inválidos.');
  }
  return {
    id: valor.id,
    type: valor.type as 'PIX' | 'CREDIT_CARD' | 'WITHDRAWAL',
    status: valor.status as
      'PENDING' | 'APPROVED' | 'DENIED' | 'EXPIRED' | 'CANCELLED',
    amount: valor.amount,
    createdAt: valor.createdAt,
    externalReference: texto(referencia) ? referencia : null,
    emv: texto(emv) ? emv : null,
    qrCodeBase64: texto(qrCodeBase64) ? qrCodeBase64 : null,
    feeAmountCents: centavos(metadados.feeAmountCents)
      ? metadados.feeAmountCents
      : null,
    netAmountCents: centavos(metadados.netAmountCents)
      ? metadados.netAmountCents
      : null,
    bandeira:
      valor.type === 'CREDIT_CARD'
        ? (metadados.cardBrand as 'VISA' | 'MASTERCARD' | 'ELO')
        : null,
    parcelas:
      valor.type === 'CREDIT_CARD' ? (metadados.installments as number) : null,
    taxaPercentual:
      valor.type === 'CREDIT_CARD' ? (metadados.feePercent as number) : null,
  };
}
