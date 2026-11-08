/**
 * Typed application configuration, derived from (already validated) environment variables.
 * Access it through `ConfigService<AppConfig, true>`.
 */
export interface AppConfig {
  port: number;
  corsOrigin: string;
  databaseUrl: string;
  redisUrl: string | null;
  s3: { endpoint: string; bucket: string; accessKey: string; secretKey: string } | null;
  sessionSecret: string;
  sessionTtlDays: number;
  cookieSecure: boolean;
  trustProxy: boolean;
  bootstrap: { email: string; name: string; password: string | null };
}

export const DEFAULT_PORT = 4000;
export const DEFAULT_CORS_ORIGIN = 'http://localhost:5173';
export const SESSION_COOKIE = 'sigma_session';

function required(name: string): string {
  const value = process.env[name];
  if (value === undefined || value === '')
    throw new Error(`Missing required environment variable ${name}`);
  return value;
}
const optional = (name: string): string | null =>
  process.env[name] ? (process.env[name] as string) : null;
const bool = (name: string, fallback: boolean): boolean => {
  const v = process.env[name];
  return v === undefined || v === '' ? fallback : ['1', 'true', 'yes'].includes(v.toLowerCase());
};

export function configuration(): AppConfig {
  const s3Endpoint = optional('S3_ENDPOINT');
  return {
    port: Number(process.env['PORT'] ?? DEFAULT_PORT),
    corsOrigin: process.env['CORS_ORIGIN'] ?? DEFAULT_CORS_ORIGIN,
    databaseUrl: required('DATABASE_URL'),
    redisUrl: optional('REDIS_URL'),
    s3: s3Endpoint
      ? {
          endpoint: s3Endpoint,
          bucket: required('S3_BUCKET'),
          accessKey: required('S3_ACCESS_KEY'),
          secretKey: required('S3_SECRET_KEY'),
        }
      : null,
    sessionSecret: required('SESSION_SECRET'),
    sessionTtlDays: Number(process.env['SESSION_TTL_DAYS'] ?? 30),
    cookieSecure: bool('COOKIE_SECURE', false),
    trustProxy: bool('TRUST_PROXY', false),
    bootstrap: {
      email: (process.env['BOOTSTRAP_ADMIN_EMAIL'] ?? 'admin@sigma.local').toLowerCase(),
      name: process.env['BOOTSTRAP_ADMIN_NAME'] ?? 'Administrator',
      password: optional('BOOTSTRAP_ADMIN_PASSWORD'),
    },
  };
}
