import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ZodResponse, ZodValidationPipe } from 'nestjs-zod';
import { createBlockSchema, type CreateBlockInput } from '@lifexp/shared';
import type { AuthenticatedUser } from '../auth/authenticated-user.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import {
  BlockDto,
  CreateBlockDto,
  DeleteBlockQueryDto,
  UpdateBlockDto,
  WeekQueryDto,
  WeekResponseDto,
} from './blocks.dto.js';
import { BlocksService } from './blocks.service.js';

@ApiTags('blocks')
@ApiBearerAuth()
@Controller('blocks')
export class BlocksController {
  constructor(private readonly blocksService: BlocksService) {}

  @Get('week')
  @ApiOperation({ summary: 'Ocorrências da semana (que começa na segunda-feira), já calculadas' })
  @ZodResponse({ type: WeekResponseDto })
  week(@CurrentUser() user: AuthenticatedUser, @Query() query: WeekQueryDto) {
    return this.blocksService.getWeek(user.id, query.weekStart);
  }

  @Post()
  @ApiOperation({ summary: 'Cria um bloco semanal ou avulso' })
  @ApiBody({ type: CreateBlockDto })
  @ZodResponse({ status: HttpStatus.CREATED, type: BlockDto })
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(createBlockSchema)) body: CreateBlockInput,
  ) {
    return this.blocksService.create(user.id, body);
  }

  @Patch(':id')
  @ApiOperation({
    summary: 'Edita a partir de uma data (esta e as próximas); o passado não muda',
    description:
      'Se a série já tem ocorrências antes de `from`, ela é encerrada no dia anterior e uma nova ' +
      'começa em `from` (a resposta é o bloco novo). Sem passado, o próprio bloco é atualizado.',
  })
  @ZodResponse({ type: BlockDto })
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: UpdateBlockDto,
  ) {
    return this.blocksService.update(user.id, id, body);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Exclui a partir de uma data (esta e as próximas)',
    description:
      'Série semanal é encerrada (o passado fica); bloco avulso é removido. Idempotente.',
  })
  remove(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Query() query: DeleteBlockQueryDto,
  ) {
    return this.blocksService.remove(user.id, id, query.from);
  }
}
