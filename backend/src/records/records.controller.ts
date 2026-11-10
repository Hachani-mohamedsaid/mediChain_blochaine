import {
  Controller,
  Get,
  Param,
  Post,
  Delete,
  Res,
  StreamableFile,
  UploadedFile,
  UseGuards,
  UseInterceptors,
  Body,
  BadRequestException,
  Patch,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import type { Response } from 'express';
import { RecordsService } from './records.service.js';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard.js';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import type { UserEntity } from '../users/user.entity.js';
import { CreateRecordDto } from './dto/create-record.dto.js';
import { AnchorNftDto } from './dto/anchor-nft.dto.js';
import { IssueRecordDto } from './dto/issue-record.dto.js';

@Controller('records')
@UseGuards(JwtAuthGuard)
export class RecordsController {
  constructor(private readonly recordsService: RecordsService) {}

  @Post()
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: 25 * 1024 * 1024 },
    }),
  )
  upload(
    @CurrentUser() user: UserEntity,
    @UploadedFile() file: Express.Multer.File | undefined,
    @Body() dto: CreateRecordDto,
  ) {
    if (!file) {
      throw new BadRequestException('file is required');
    }
    return this.recordsService.createFromUpload(user, file, dto);
  }

  /** Médecin → patient : ordo / certificat */
  @Post('issue')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: 25 * 1024 * 1024 },
    }),
  )
  issue(
    @CurrentUser() user: UserEntity,
    @UploadedFile() file: Express.Multer.File | undefined,
    @Body() dto: IssueRecordDto,
  ) {
    if (!file) {
      throw new BadRequestException('file is required');
    }
    return this.recordsService.issueToPatient(user, file, dto);
  }

  @Get('mine')
  mine(@CurrentUser() user: UserEntity) {
    return this.recordsService.listMine(user);
  }

  @Get('issued')
  issued(@CurrentUser() user: UserEntity) {
    return this.recordsService.listIssuedByDoctor(user);
  }

  @Get('shared-with-me')
  shared(@CurrentUser() user: UserEntity) {
    return this.recordsService.listSharedWithDoctor(user);
  }

  /** Dossier + historique docs d’un patient (médecin après consultation) */
  @Get('patient/:patientId')
  patientDossier(
    @CurrentUser() user: UserEntity,
    @Param('patientId') patientId: string,
  ) {
    return this.recordsService.listPatientDossierForDoctor(user, patientId);
  }

  @Get(':id/file')
  async file(
    @CurrentUser() user: UserEntity,
    @Param('id') id: string,
    @Res({ passthrough: true }) res: Response,
  ) {
    const record = await this.recordsService.getByIdForUser(id, user);
    const plain = await this.recordsService.readDecryptedFile(record);
    res.set({
      'Content-Type': record.mimeType || 'application/octet-stream',
      'Content-Disposition': `inline; filename="${record.originalName.replace(/"/g, '')}"`,
    });
    return new StreamableFile(plain);
  }

  @Patch(':id/nft')
  anchorNft(
    @CurrentUser() user: UserEntity,
    @Param('id') id: string,
    @Body() dto: AnchorNftDto,
  ) {
    return this.recordsService.anchorNft(user, id, dto);
  }

  @Delete(':id')
  remove(@CurrentUser() user: UserEntity, @Param('id') id: string) {
    return this.recordsService.deletePatientImport(user, id);
  }

  @Get(':id')
  one(@CurrentUser() user: UserEntity, @Param('id') id: string) {
    return this.recordsService.getByIdForUser(id, user);
  }
}
