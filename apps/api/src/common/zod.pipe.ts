import { BadRequestException, Injectable } from '@nestjs/common';
import type { PipeTransform } from '@nestjs/common';
import type { ZodType } from 'zod';

/** Validates a request body against a zod schema from @sigma/validation. */
@Injectable()
export class ZodValidationPipe<T> implements PipeTransform<unknown, T> {
  constructor(private readonly schema: ZodType<T>) {}

  transform(value: unknown): T {
    const result = this.schema.safeParse(value);
    if (result.success) return result.data;
    const message = result.error.issues.map((i) => `${i.path.join('.') || 'body'}: ${i.message}`);
    throw new BadRequestException({ statusCode: 400, message, error: 'Bad Request' });
  }
}

export const zod = <T>(schema: ZodType<T>): ZodValidationPipe<T> => new ZodValidationPipe(schema);
