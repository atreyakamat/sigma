import 'reflect-metadata';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaPg } from '@prisma/adapter-pg';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import type { Response } from 'supertest';
import { PrismaClient } from '../prisma/generated/client';
import { AppModule } from '../src/app.module';

export const ORIGIN = 'http://localhost:5173';
export const ADMIN = { email: 'admin@sigma.local', password: 'admin-password-123' };

export async function truncateAll(): Promise<void> {
  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: process.env['DATABASE_URL'] as string }),
  });
  await prisma.$executeRawUnsafe('TRUNCATE TABLE "users" RESTART IDENTITY CASCADE');
  await prisma.$disconnect();
}

export async function createApp(): Promise<INestApplication> {
  await truncateAll();
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  const app = moduleRef.createNestApplication();
  app.setGlobalPrefix('api/v1');
  app.use(cookieParser());
  await app.init();
  return app;
}

export class Client {
  cookie = '';
  constructor(
    private readonly app: INestApplication,
    public readonly label = 'anon',
  ) {}

  private req(method: 'get' | 'post' | 'put' | 'patch' | 'delete', path: string) {
    const r = request(this.app.getHttpServer())[method](`/api/v1${path}`).set('Origin', ORIGIN);
    return this.cookie ? r.set('Cookie', this.cookie) : r;
  }
  get(path: string): Promise<Response> {
    return this.req('get', path);
  }
  post(path: string, body?: unknown): Promise<Response> {
    return this.req('post', path).send(body ?? {});
  }
  put(path: string, body?: unknown): Promise<Response> {
    return this.req('put', path).send(body ?? {});
  }
  patch(path: string, body?: unknown): Promise<Response> {
    return this.req('patch', path).send(body ?? {});
  }
  delete(path: string): Promise<Response> {
    return this.req('delete', path);
  }

  async login(email: string, password: string): Promise<Response> {
    const res = await this.post('/auth/login', { email, password });
    const set = res.headers['set-cookie'] as string[] | string | undefined;
    const raw = Array.isArray(set) ? set[0] : set;
    if (res.status === 200 && raw) this.cookie = raw.split(';')[0] as string;
    return res;
  }
}

export async function adminClient(app: INestApplication): Promise<Client> {
  const c = new Client(app, 'admin');
  const res = await c.login(ADMIN.email, ADMIN.password);
  if (res.status !== 200)
    throw new Error(`admin login failed: ${res.status} ${JSON.stringify(res.body)}`);
  return c;
}

/** Admin creates a user with a known password and returns a logged-in client for them. */
export async function userClient(
  app: INestApplication,
  admin: Client,
  name: string,
  systemRole: 'ADMIN' | 'MEMBER' = 'MEMBER',
): Promise<Client & { id: string; email: string }> {
  const email = `${name.toLowerCase()}@sigma.local`;
  const password = `${name}-password-123`;
  const created = await admin.post('/users', { name, email, systemRole, password });
  if (created.status !== 201)
    throw new Error(`create user failed: ${created.status} ${JSON.stringify(created.body)}`);
  const c = new Client(app, name) as Client & { id: string; email: string };
  c.id = created.body.user.id;
  c.email = email;
  const res = await c.login(email, password);
  if (res.status !== 200) throw new Error(`login failed for ${name}: ${res.status}`);
  return c;
}
