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
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ZodResponse, createZodDto } from 'nestjs-zod';
import {
  createNoteSchema,
  listNotesQuerySchema,
  notePageSchema,
  noteSchema,
  tagListSchema,
  updateNoteSchema,
} from '@lifexp/shared';
import type { AuthenticatedUser } from '../auth/authenticated-user.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import { NotesService } from './notes.service.js';

class NoteDto extends createZodDto(noteSchema) {}
class CreateNoteDto extends createZodDto(createNoteSchema) {}
class UpdateNoteDto extends createZodDto(updateNoteSchema) {}
class ListNotesQueryDto extends createZodDto(listNotesQuerySchema) {}
class NotePageDto extends createZodDto(notePageSchema) {}
class TagListDto extends createZodDto(tagListSchema) {}

@ApiTags('notes')
@ApiBearerAuth()
@Controller('notes')
export class NotesController {
  constructor(private readonly notes: NotesService) {}

  @Get()
  @ApiOperation({
    summary: 'Lista as notas (fixadas primeiro), com busca por texto, filtro por tag e por vínculo',
  })
  @ZodResponse({ type: NotePageDto })
  list(@CurrentUser() user: AuthenticatedUser, @Query() query: ListNotesQueryDto) {
    return this.notes.list(user.id, query);
  }

  // Antes de `:id`, senão "tags" seria lido como um id.
  @Get('tags')
  @ApiOperation({ summary: 'As tags da pessoa com a quantidade de notas de cada uma' })
  @ZodResponse({ type: TagListDto })
  tags(@CurrentUser() user: AuthenticatedUser) {
    return this.notes.tags(user.id);
  }

  @Post()
  @ApiOperation({ summary: 'Cria uma nota em markdown' })
  @ZodResponse({ status: HttpStatus.CREATED, type: NoteDto })
  create(@CurrentUser() user: AuthenticatedUser, @Body() body: CreateNoteDto) {
    return this.notes.create(user.id, body);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Uma nota, com o texto completo' })
  @ZodResponse({ type: NoteDto })
  get(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.notes.get(user.id, id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Edita só os campos enviados (inclusive fixar e vincular)' })
  @ZodResponse({ type: NoteDto })
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: UpdateNoteDto,
  ) {
    return this.notes.update(user.id, id, body);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Exclui a nota' })
  async remove(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<void> {
    await this.notes.remove(user.id, id);
  }
}
