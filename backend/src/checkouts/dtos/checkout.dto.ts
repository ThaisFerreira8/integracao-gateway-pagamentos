import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEnum,
  IsIn,
  IsInt,
  IsISO8601,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { MetodoPagamento } from '../entities/link-checkout.entity';
import type { BandeiraGateway } from '../tipos/contrato-pagamentos-gateway';

export class ConsultaTaxasDto {
  @ApiPropertyOptional({ enum: ['VISA', 'MASTERCARD', 'ELO'] })
  @IsOptional()
  @IsIn(['VISA', 'MASTERCARD', 'ELO'])
  bandeira?: BandeiraGateway;
}

export class CriarCheckoutDto {
  @ApiPropertyOptional({ enum: ['VISA', 'MASTERCARD', 'ELO'] })
  @IsOptional()
  @IsIn(['VISA', 'MASTERCARD', 'ELO'])
  bandeira?: BandeiraGateway;

  @ApiPropertyOptional({ minimum: 1, maximum: 21 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(21)
  parcelas?: number;

  @ApiProperty({
    description: 'Valor inteiro em centavos.',
    minimum: 1,
    maximum: 4294967295,
  })
  @IsInt()
  @Min(1)
  @Max(4294967295)
  valorCentavos: number;

  @ApiProperty({ enum: MetodoPagamento })
  @IsEnum(MetodoPagamento)
  metodo: MetodoPagamento;

  @ApiProperty({
    format: 'date-time',
    description: 'Data futura de expiração do link.',
  })
  @IsISO8601({ strict: true, strictSeparator: true })
  expiraEm: string;
}

export class PagarPixDto {
  @ApiProperty({
    description: 'CPF/CNPJ do pagador, somente dígitos.',
    writeOnly: true,
  })
  @Matches(/^(?:\d{11}|\d{14})$/)
  documentoPagador: string;
}

export class PagarCartaoDto {
  @ApiProperty({ enum: ['VISA', 'MASTERCARD', 'ELO'] })
  @IsIn(['VISA', 'MASTERCARD', 'ELO'])
  bandeira: BandeiraGateway;

  @ApiProperty({ minimum: 1, maximum: 21 })
  @IsInt()
  @Min(1)
  @Max(21)
  parcelas: number;

  @ApiProperty({ writeOnly: true })
  @Matches(/^\d{13,19}$/)
  numeroCartao: string;

  @ApiProperty({ writeOnly: true })
  @IsString()
  @IsNotEmpty()
  @MaxLength(150)
  titularCartao: string;

  @ApiProperty({ writeOnly: true, example: '12' })
  @Matches(/^(?:0[1-9]|1[0-2])$/)
  mesValidade: string;

  @ApiProperty({ writeOnly: true, example: '2030' })
  @Matches(/^\d{4}$/)
  anoValidade: string;

  @ApiProperty({ writeOnly: true })
  @Matches(/^\d{3,4}$/)
  codigoSeguranca: string;
}
