import { Injectable, Logger } from '@nestjs/common';
import type { OnApplicationBootstrap } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { generatePassword, hashPassword } from '../common/password';
import type { AppConfig } from '../config/configuration';
import { PrismaService } from '../prisma/prisma.service';

/** Creates the first administrator and a default workspace on an empty database. Idempotent. */
@Injectable()
export class BootstrapService implements OnApplicationBootstrap {
  private readonly logger = new Logger('Bootstrap');

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService<AppConfig, true>,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    if ((await this.prisma.user.count()) > 0) return;
    const { email, name, password } = this.config.get('bootstrap', { infer: true });
    const initial = password ?? generatePassword();
    await this.prisma.user
      .create({
        data: {
          name,
          email,
          systemRole: 'ADMIN',
          passwordHash: await hashPassword(initial),
          mustChangePassword: password === null,
          ownedWorkspaces: {
            create: {
              name: 'Workspace',
              slug: 'workspace',
              members: { create: { role: 'OWNER', user: { connect: { email } } } },
            },
          },
        },
      })
      .catch(async () => {
        // `connect` inside a nested create of the same user is not possible; do it in two steps.
        const user = await this.prisma.user.create({
          data: {
            name,
            email,
            systemRole: 'ADMIN',
            passwordHash: await hashPassword(initial),
            mustChangePassword: password === null,
          },
        });
        await this.prisma.workspace.create({
          data: {
            name: 'Workspace',
            slug: 'workspace',
            ownerId: user.id,
            members: { create: { userId: user.id, role: 'OWNER' } },
          },
        });
      });
    const lines = [
      '==================================================================',
      '  SIGMA first start: administrator account created',
      `  Email:    ${email}`,
      password ? '  Password: (from BOOTSTRAP_ADMIN_PASSWORD)' : `  Password: ${initial}`,
      password ? '' : '  You will be asked to change it after signing in.',
      '==================================================================',
    ].filter(Boolean);
    for (const l of lines) this.logger.log(l);
  }
}
