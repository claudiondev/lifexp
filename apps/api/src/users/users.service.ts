import { Injectable, UnauthorizedException } from '@nestjs/common';
import type { UpdateProfileInput, User } from '@lifexp/shared';
import { PrismaService } from '../prisma/prisma.service.js';
import { toUserResponse } from './user.mapper.js';

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async getById(id: string): Promise<User> {
    const user = await this.prisma.user.findUnique({ where: { id } });
    // Token válido de um usuário que não existe mais: trata como não autenticado.
    if (!user) throw new UnauthorizedException('Não autenticado');
    return toUserResponse(user);
  }

  /**
   * Só nome, fuso e emblema são editáveis aqui; o schema estrito rejeita qualquer outro campo
   * (e-mail e senha têm fluxos próprios). O alvo é sempre o dono do token (RN39).
   */
  async updateProfile(id: string, input: UpdateProfileInput): Promise<User> {
    const user = await this.prisma.user.update({ where: { id }, data: input });
    return toUserResponse(user);
  }
}
