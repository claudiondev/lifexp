import {
  Controller,
  Delete,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ZodResponse, ZodValidationPipe } from 'nestjs-zod';
import { civilDateSchema, type CivilDate } from '@lifexp/shared';
import type { AuthenticatedUser } from '../auth/authenticated-user.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import { CompletionResultDto, UndoResultDto } from './completions.dto.js';
import { CompletionsService } from './completions.service.js';

@ApiTags('completions')
@ApiBearerAuth()
@Controller('blocks')
export class CompletionsController {
  constructor(private readonly completionsService: CompletionsService) {}

  @Post(':id/occurrences/:date/completion')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Conclui uma ocorrência e gera XP',
    description:
      '`date` é a data ORIGINAL da ocorrência na série. Só vale de o início do bloco até 23:59 do dia ' +
      'seguinte. Repetir a chamada é seguro: não dá XP em dobro.',
  })
  @ZodResponse({ type: CompletionResultDto })
  complete(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('date', new ZodValidationPipe(civilDateSchema)) date: CivilDate,
  ) {
    return this.completionsService.complete(user.id, id, date);
  }

  @Delete(':id/occurrences/:date/completion')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Desfaz a conclusão dentro da janela (cria um estorno)',
    description: 'Nada é apagado: o XP volta por um lançamento negativo. Repetir é seguro.',
  })
  @ZodResponse({ type: UndoResultDto })
  undo(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('date', new ZodValidationPipe(civilDateSchema)) date: CivilDate,
  ) {
    return this.completionsService.undo(user.id, id, date);
  }
}
