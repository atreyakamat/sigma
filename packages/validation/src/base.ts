import { z } from 'zod';

export const EmailSchema = z.string().trim().toLowerCase().email().max(254);
export const PasswordSchema = z.string().min(10, 'Use at least 10 characters').max(128);
export const NameSchema = z.string().trim().min(1).max(120);
export const SlugSchema = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^[a-z0-9](?:[a-z0-9-]{1,62}[a-z0-9])?$/, 'Lowercase letters, numbers and dashes only');
