import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'isPublic';

/** Marca rota/controller como pública. O padrão da API é exigir autenticação (deny by default). */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
