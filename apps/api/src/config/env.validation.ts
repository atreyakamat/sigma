import { plainToInstance } from 'class-transformer';
import {
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUrl,
  Max,
  Min,
  MinLength,
  validateSync,
} from 'class-validator';
import { DEFAULT_CORS_ORIGIN, DEFAULT_PORT } from './configuration';

/** Shape of the raw environment, validated once at startup by `ConfigModule.forRoot`. */
export class EnvironmentVariables {
  @IsInt() @Min(0) @Max(65535) PORT: number = DEFAULT_PORT;
  @IsString() @IsNotEmpty() CORS_ORIGIN: string = DEFAULT_CORS_ORIGIN;
  @IsUrl({ require_tld: false, require_protocol: true, protocols: ['postgresql', 'postgres'] })
  DATABASE_URL!: string;
  @IsOptional()
  @IsUrl({ require_tld: false, require_protocol: true, protocols: ['redis', 'rediss'] })
  REDIS_URL?: string;
  @IsOptional() @IsUrl({ require_tld: false, require_protocol: true }) S3_ENDPOINT?: string;
  @IsOptional() @IsString() S3_BUCKET?: string;
  @IsOptional() @IsString() S3_ACCESS_KEY?: string;
  @IsOptional() @IsString() S3_SECRET_KEY?: string;
  @IsString() @MinLength(8) SESSION_SECRET!: string;
  @IsOptional() @IsInt() @Min(1) @Max(365) SESSION_TTL_DAYS?: number;
  @IsOptional() @IsString() BOOTSTRAP_ADMIN_EMAIL?: string;
  @IsOptional() @IsString() BOOTSTRAP_ADMIN_NAME?: string;
  @IsOptional() @IsString() SIGMA_DESKTOP?: string;
  @IsOptional() @IsString() SIGMA_LOCAL_TOKEN?: string;
  @IsOptional() @IsString() BOOTSTRAP_ADMIN_PASSWORD?: string;
  @IsOptional() @IsInt() @Min(1) @Max(1024) MAX_UPLOAD_MB?: number;
  @IsOptional() @IsString() DATA_DIR?: string;
  @IsOptional() @IsString() APP_VERSION?: string;
}

export function validateEnv(config: Record<string, unknown>): EnvironmentVariables {
  const cleaned = Object.fromEntries(Object.entries(config).filter(([, v]) => v !== ''));
  const validated = plainToInstance(EnvironmentVariables, cleaned, {
    enableImplicitConversion: true,
  });
  const errors = validateSync(validated, { skipMissingProperties: false });
  if (errors.length > 0) {
    const details = errors
      .map((error) => Object.values(error.constraints ?? {}).join('; '))
      .join('\n  ');
    throw new Error(`Invalid environment configuration:\n  ${details}`);
  }
  return validated;
}
