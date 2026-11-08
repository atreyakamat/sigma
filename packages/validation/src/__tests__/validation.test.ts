import { describe, expect, it } from 'vitest';
import { LoginSchema, RegisterSchema, SlugSchema, CreateDocumentSchema } from '../index';

describe('validation schemas', () => {
  it('normalizes emails and enforces password length', () => {
    const r = RegisterSchema.parse({
      name: ' Ada ',
      email: ' ADA@Example.com ',
      password: 'correct horse battery',
    });
    expect(r).toEqual({ name: 'Ada', email: 'ada@example.com', password: 'correct horse battery' });
    expect(
      RegisterSchema.safeParse({ name: 'A', email: 'a@b.co', password: 'short' }).success,
    ).toBe(false);
    expect(LoginSchema.safeParse({ email: 'nope', password: 'x' }).success).toBe(false);
    expect(
      RegisterSchema.safeParse({ name: 'A', email: 'a@b.co', password: 'long enough pw', extra: 1 })
        .success,
    ).toBe(false);
  });
  it('validates slugs and document creation', () => {
    expect(SlugSchema.safeParse('my-team-1').success).toBe(true);
    expect(SlugSchema.safeParse('-bad').success).toBe(false);
    expect(CreateDocumentSchema.safeParse({ projectId: 'not-a-uuid', name: 'Doc' }).success).toBe(
      false,
    );
    expect(
      CreateDocumentSchema.safeParse({
        projectId: '1b4e28ba-2fa1-11d2-883f-0016d3cca427',
        name: 'Doc',
      }).success,
    ).toBe(true);
  });
});
