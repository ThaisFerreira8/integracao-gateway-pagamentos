import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export type FiltroEstadoPagamento =
  'APPROVED' | 'DENIED' | 'EXPIRED' | 'CANCELLED';

// Converte apenas inteiros decimais; entradas vazias, fracionárias ou exponenciais são rejeitadas.
const converterInteiro = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' && /^\d+$/.test(value) ? Number(value) : value;

export class ConsultarReferenciaPagamentoDto {
  @ApiProperty({
    description: 'Referência externa local do pedido (externalReference).',
    maxLength: 100,
  })
  @IsString()
  @Matches(/\S/)
  @MaxLength(100)
  referenciaExterna: string;
}

export class ConsultarPagamentosDto {
  @ApiPropertyOptional({
    enum: ['APPROVED', 'DENIED', 'EXPIRED', 'CANCELLED'],
    description:
      'APPROVED/DENIED: estado do pedido ou de uma transação local de pagamento. EXPIRED/CANCELLED: somente transações locais; expiração/cancelamento do link não prova estado financeiro.',
  })
  @IsOptional()
  @IsIn(['APPROVED', 'DENIED', 'EXPIRED', 'CANCELLED'])
  status?: FiltroEstadoPagamento;

  @ApiPropertyOptional({
    description:
      'Busca exata pela referência externa local (externalReference).',
    maxLength: 100,
  })
  @IsOptional()
  @IsString()
  @Matches(/\S/)
  @MaxLength(100)
  referenciaExterna?: string;

  @ApiPropertyOptional({ default: 1, minimum: 1, maximum: 100000 })
  @Transform(converterInteiro)
  @IsInt()
  @Min(1)
  @Max(100000)
  pagina: number = 1;

  @ApiPropertyOptional({ default: 20, minimum: 1, maximum: 100 })
  @Transform(converterInteiro)
  @IsInt()
  @Min(1)
  @Max(100)
  limite: number = 20;
}
