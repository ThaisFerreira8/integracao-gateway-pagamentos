import { SetMetadata } from '@nestjs/common';

export const CHAVE_ROTA_PUBLICA = 'rotaPublica';

export const RotaPublica = () => SetMetadata(CHAVE_ROTA_PUBLICA, true);
