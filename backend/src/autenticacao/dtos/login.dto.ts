import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsEmail, IsString, MaxLength, MinLength } from 'class-validator';

export class LoginDto {
  @ApiProperty({
    description: 'E-mail cadastrado na aplicação BaaS.',
    example: 'lojista@example.com',
  })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  )
  @IsEmail()
  @MaxLength(254)
  email: string;

  @ApiProperty({
    description: 'Senha da aplicação BaaS, distinta da senha do gateway.',
    format: 'password',
    writeOnly: true,
  })
  @IsString()
  @MinLength(1)
  @MaxLength(128)
  senha: string;
}
