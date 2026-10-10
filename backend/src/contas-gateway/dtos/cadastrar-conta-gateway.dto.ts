import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEmail,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Validate,
  ValidatorConstraint,
  type ValidationArguments,
  type ValidatorConstraintInterface,
} from 'class-validator';

@ValidatorConstraint({ name: 'documentoCompativelComPessoa', async: false })
class DocumentoCompativelComPessoa implements ValidatorConstraintInterface {
  validate(documento: unknown, argumentos: ValidationArguments): boolean {
    const entrada = argumentos.object as CadastrarContaGatewayDto;
    return (
      typeof documento === 'string' &&
      (entrada.tipoPessoa === 'PF'
        ? /^\d{11}$/.test(documento)
        : entrada.tipoPessoa === 'PJ' && /^\d{14}$/.test(documento))
    );
  }

  defaultMessage(): string {
    return 'documento deve conter 11 dígitos para PF ou 14 para PJ';
  }
}

export class CadastrarContaGatewayDto {
  @ApiProperty({ enum: ['PF', 'PJ'] })
  @IsIn(['PF', 'PJ'])
  tipoPessoa: 'PF' | 'PJ';

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  @MaxLength(150)
  nome: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(150)
  nomeFantasia?: string;

  @ApiProperty({ format: 'email' })
  @IsEmail()
  @MaxLength(254)
  email: string;

  @ApiProperty({ description: 'Celular real com DDD, somente 11 dígitos.' })
  @Matches(/^\d{11}$/)
  telefone: string;

  @ApiProperty({
    description:
      'CPF/CNPJ somente com dígitos; o sandbox permite documento fictício.',
  })
  @Validate(DocumentoCompativelComPessoa)
  documento: string;

  @ApiProperty()
  @Matches(/^\d{8}$/)
  cep: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  endereco: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  @MaxLength(20)
  numero: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(255)
  complemento?: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  @MaxLength(150)
  bairro: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  @MaxLength(150)
  cidade: string;

  @ApiProperty({ description: 'Sigla da UF em maiúsculas.' })
  @Matches(/^[A-Z]{2}$/)
  estado: string;
}

export class VincularContaGatewayDto {
  @ApiProperty({ description: 'Documento da conta específica do lojista.' })
  @Matches(/^(?:\d{11}|\d{14})$/)
  documento: string;

  @ApiProperty({
    format: 'password',
    writeOnly: true,
    description: 'Usada somente nesta autenticação; não será persistida.',
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(128)
  senha: string;
}
