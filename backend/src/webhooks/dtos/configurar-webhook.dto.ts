import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsString, IsUrl, Matches, ValidateIf } from 'class-validator';

// Os nomes de entrada seguem o contrato publicado pelo gateway.
export class ConfigurarWebhookDto {
  @ApiProperty({ enum: ['PAYMENT_PIX', 'PAYMENT_CARD', 'WITHDRAWAL'] })
  @IsIn(['PAYMENT_PIX', 'PAYMENT_CARD', 'WITHDRAWAL'])
  event: 'PAYMENT_PIX' | 'PAYMENT_CARD' | 'WITHDRAWAL';

  @ApiProperty({
    format: 'uri',
    description:
      'URL HTTPS do destino. O BaaS ainda não recebe/processa callbacks.',
  })
  @IsUrl({
    protocols: ['https'],
    require_protocol: true,
    require_valid_protocol: true,
    require_tld: false,
    disallow_auth: true,
  })
  url: string;

  @ApiPropertyOptional({
    writeOnly: true,
    format: 'password',
    description:
      'Enviado somente ao gateway, sem persistência local ou retorno. A verificação HMAC ainda não está implementada.',
  })
  @ValidateIf((_entrada, valor: unknown) => valor !== undefined)
  @IsString()
  @Matches(/\S/)
  secret?: string;
}
