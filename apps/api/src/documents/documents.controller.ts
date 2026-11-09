import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
} from '@nestjs/common';
import type {
  CreateDocumentInputV1,
  DocumentDto,
  DocumentSummaryDto,
  SaveContentInput,
  SaveContentResponse,
} from '@sigma/validation';
import {
  CreateDocumentBody,
  DocumentOpsBody,
  SaveContentBody,
  UpdateDocumentBody,
} from '@sigma/validation';
import type { DocumentOpsInput, DocumentOpsResponse } from '@sigma/validation';
import type { DocumentOp, DocumentOutline } from '@sigma/document';
import type { User } from '../../prisma/generated/client';
import { CurrentUser } from '../common/auth.decorators';
import { zod } from '../common/zod.pipe';
import { DocumentsService } from './documents.service';

@Controller()
export class DocumentsController {
  constructor(private readonly documents: DocumentsService) {}

  @Get('projects/:id/documents') list(
    @CurrentUser() user: User,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<DocumentSummaryDto[]> {
    return this.documents.list(user, id);
  }
  @Post('projects/:id/documents') create(
    @CurrentUser() user: User,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(zod(CreateDocumentBody)) body: CreateDocumentInputV1,
  ): Promise<DocumentDto> {
    return this.documents.create(user, id, body);
  }
  @Get('documents/:id') get(
    @CurrentUser() user: User,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<DocumentDto> {
    return this.documents.get(user, id);
  }
  @Patch('documents/:id') update(
    @CurrentUser() user: User,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(zod(UpdateDocumentBody)) body: { name?: string },
  ): Promise<DocumentSummaryDto> {
    return this.documents.update(user, id, body);
  }
  @Put('documents/:id/content') save(
    @CurrentUser() user: User,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(zod(SaveContentBody)) body: SaveContentInput,
  ): Promise<SaveContentResponse> {
    return this.documents.saveContent(user, id, body);
  }
  @Get('documents/:id/outline') outline(
    @CurrentUser() user: User,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<DocumentOutline> {
    return this.documents.outline(user, id);
  }
  @Post('documents/:id/ops') @HttpCode(200) ops(
    @CurrentUser() user: User,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(zod(DocumentOpsBody)) body: DocumentOpsInput,
  ): Promise<DocumentOpsResponse> {
    return this.documents.applyOps(user, id, body.ops as DocumentOp[]);
  }
  @Delete('documents/:id') @HttpCode(204) remove(
    @CurrentUser() user: User,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<void> {
    return this.documents.remove(user, id);
  }
}
