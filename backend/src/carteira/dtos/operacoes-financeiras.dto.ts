import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export const ESTADOS_EXTRATO = [
  'PENDING',
  'APPROVED',
  'DENIED',
  'EXPIRED',
  'CANCELLED',
] as const;
export const TIPOS_EXTRATO = ['PIX', 'CREDIT_CARD', 'WITHDRAWAL'] as const;

// Os nomes dos filtros preservam os parâmetros documentados pelo gateway.
export class ConsultarExtratoDto {
  @ApiPropertyOptional({ enum: ESTADOS_EXTRATO })
  @IsOptional()
  @IsIn(ESTADOS_EXTRATO)
  status?: (typeof ESTADOS_EXTRATO)[number];

  @ApiPropertyOptional({ enum: TIPOS_EXTRATO })
  @IsOptional()
  @IsIn(TIPOS_EXTRATO)
  type?: (typeof TIPOS_EXTRATO)[number];

  @ApiPropertyOptional({
    minimum: 1,
    description:
      'Inteiro positivo representável com segurança. O gateway não documenta máximo ou padrão.',
  })
  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' && /^\d+$/.test(value) ? Number(value) : value,
  )
  @IsInt()
  @Min(1)
  @Max(Number.MAX_SAFE_INTEGER)
  limit?: number;
}

// Entrada do BaaS traduzida para o contrato observado de saque do gateway.
export class SolicitarSaqueDto {
  @ApiProperty({ description: 'Valor inteiro em centavos.', minimum: 1 })
  @IsInt()
  @Min(1)
  @Max(4294967295)
  valorCentavos: number;

  @ApiProperty({ writeOnly: true })
  @IsString()
  @IsNotEmpty()
  @Matches(/\S/)
  @MaxLength(254)
  chavePix: string;

  @ApiProperty({
    writeOnly: true,
    description: 'CPF do titular, somente 11 dígitos.',
  })
  @Matches(/^\d{11}$/)
  documentoTitular: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(255)
  descricao?: string;

  @ApiPropertyOptional({
    description: 'Corresponde a externalReference na entrada do gateway.',
  })
  @IsOptional()
  @IsString()
  @Matches(/\S/)
  @MaxLength(100)
  referenciaExterna?: string;
}
