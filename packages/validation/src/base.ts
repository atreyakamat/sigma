import { z } from 'zod';

export const EmailSchema = z.string().trim().toLowerCase().email().max(254);
/** Passwords that appear at the top of every breach list; rejected even when padded with digits/symbols. */
const COMMON_PASSWORDS = [
  'password',
  'passw0rd',
  'qwerty',
  'qwertyuiop',
  'iloveyou',
  'letmein',
  'welcome',
  'admin',
  'administrator',
  'monkey',
  'dragon',
  'football',
  'baseball',
  'sunshine',
  'princess',
  'abc123',
  '123456',
  '1234567',
  '12345678',
  '123456789',
  '1234567890',
  'sigma',
];
export function isCommonPassword(password: string): boolean {
  const core = password
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
    .replace(/^(\d+)/, '')
    .replace(/(\d+)$/, '');
  const digitsOnly =
    /^\d+$/.test(password.replace(/[^0-9]/g, '')) &&
    password.replace(/[^0-9]/g, '').length === password.length;
  return (
    digitsOnly ||
    COMMON_PASSWORDS.includes(core) ||
    COMMON_PASSWORDS.includes(password.toLowerCase())
  );
}
export const PasswordSchema = z
  .string()
  .min(10, 'Use at least 10 characters')
  .max(128)
  .refine(
    (p) => !isCommonPassword(p),
    'That password is too common; choose something less guessable',
  );
export const NameSchema = z.string().trim().min(1).max(120);
export const SlugSchema = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^[a-z0-9](?:[a-z0-9-]{1,62}[a-z0-9])?$/, 'Lowercase letters, numbers and dashes only');
