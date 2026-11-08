import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import { loadImage } from '@napi-rs/canvas';
import {
  BadRequestException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { sniffImageMime } from '@sigma/import-export';
import type { AssetDto } from '@sigma/validation';
import type { Asset, User } from '../../prisma/generated/client';
import { AuditService } from '../audit/audit.service';
import type { AppConfig } from '../config/configuration';
import { PermissionsService } from '../permissions/permissions.service';
import { PrismaService } from '../prisma/prisma.service';
import type { ObjectStorage } from './storage';
import { createStorage } from './storage';

function toDto(a: Asset): AssetDto {
  return {
    id: a.id,
    workspaceId: a.workspaceId,
    filename: a.filename,
    mimeType: a.mimeType,
    fileSize: Number(a.fileSize),
    width: a.width,
    height: a.height,
    url: `/api/v1/assets/${a.id}/content`,
    uploadedById: a.uploadedById,
    createdAt: a.createdAt.toISOString(),
  };
}

@Injectable()
export class AssetsService {
  private readonly storage: ObjectStorage;
  private readonly secret: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly perms: PermissionsService,
    private readonly audit: AuditService,
    config: ConfigService<AppConfig, true>,
  ) {
    this.storage = createStorage({
      s3: config.get('s3', { infer: true }),
      dataDir: config.get('dataDir', { infer: true }),
    } as AppConfig);
    this.secret = config.get('sessionSecret', { infer: true });
  }

  async list(user: User, workspaceId: string): Promise<AssetDto[]> {
    await this.perms.assert(user, workspaceId, 'workspace.read');
    return (
      await this.prisma.asset.findMany({ where: { workspaceId }, orderBy: { createdAt: 'desc' } })
    ).map(toDto);
  }

  async upload(
    user: User,
    workspaceId: string,
    file: { buffer: Buffer; originalname: string; size: number },
    ip?: string,
  ): Promise<AssetDto> {
    await this.perms.assert(user, workspaceId, 'document.create');
    const mime = sniffImageMime(new Uint8Array(file.buffer));
    if (!mime)
      throw new BadRequestException('Only PNG, JPEG, WebP, GIF and SVG images are accepted');
    let width: number | null = null;
    let height: number | null = null;
    if (mime !== 'image/svg+xml') {
      try {
        const img = await loadImage(file.buffer);
        width = img.width;
        height = img.height;
      } catch {
        throw new BadRequestException('The image could not be decoded');
      }
    }
    const id = randomUUID();
    const ext = {
      'image/png': 'png',
      'image/jpeg': 'jpg',
      'image/webp': 'webp',
      'image/gif': 'gif',
      'image/svg+xml': 'svg',
    }[mime];
    const storageKey = `${workspaceId}/${id}.${ext}`;
    await this.storage.put(storageKey, file.buffer, mime);
    const row = await this.prisma.asset.create({
      data: {
        id,
        workspaceId,
        uploadedById: user.id,
        filename: file.originalname.slice(0, 255),
        mimeType: mime,
        storageKey,
        fileSize: BigInt(file.size),
        width,
        height,
      },
    });
    void this.audit.record('asset.upload', {
      actorId: user.id,
      targetType: 'asset',
      targetId: id,
      ip,
      metadata: { filename: row.filename, size: file.size },
    });
    return toDto(row);
  }

  private async find(id: string): Promise<Asset> {
    const row = await this.prisma.asset.findUnique({ where: { id } });
    if (!row) throw new NotFoundException('Asset not found');
    return row;
  }

  /** Content for a signed-in member, or for anyone holding a valid signature. */
  async content(
    id: string,
    user: User | null,
    exp?: string,
    sig?: string,
  ): Promise<{ data: Buffer; mimeType: string; filename: string }> {
    const row = await this.find(id);
    if (user) {
      await this.perms.assert(user, row.workspaceId, 'workspace.read');
    } else {
      if (!exp || !sig) throw new UnauthorizedException('Not signed in');
      if (Number(exp) * 1000 < Date.now()) throw new UnauthorizedException('Link expired');
      const expected = this.signature(id, exp);
      if (
        expected.length !== sig.length ||
        !timingSafeEqual(Buffer.from(expected), Buffer.from(sig))
      )
        throw new UnauthorizedException('Invalid signature');
    }
    const data = await this.storage.get(row.storageKey);
    if (!data) throw new NotFoundException('Asset content missing');
    return { data, mimeType: row.mimeType, filename: row.filename };
  }

  private signature(id: string, exp: string): string {
    return createHmac('sha256', this.secret).update(`${id}:${exp}`).digest('hex');
  }

  async signedUrl(
    user: User,
    id: string,
    expiresInSeconds: number,
  ): Promise<{ url: string; expiresAt: string }> {
    const row = await this.find(id);
    await this.perms.assert(user, row.workspaceId, 'workspace.read');
    const exp = String(Math.floor(Date.now() / 1000) + expiresInSeconds);
    return {
      url: `/api/v1/assets/${id}/content?exp=${exp}&sig=${this.signature(id, exp)}`,
      expiresAt: new Date(Number(exp) * 1000).toISOString(),
    };
  }

  async remove(user: User, id: string, ip?: string): Promise<void> {
    const row = await this.find(id);
    await this.perms.assert(user, row.workspaceId, 'document.delete');
    await this.storage.delete(row.storageKey);
    await this.prisma.asset.delete({ where: { id } });
    void this.audit.record('asset.delete', {
      actorId: user.id,
      targetType: 'asset',
      targetId: id,
      ip,
    });
  }
}
