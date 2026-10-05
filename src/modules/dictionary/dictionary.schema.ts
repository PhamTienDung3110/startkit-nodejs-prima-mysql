import { z } from 'zod';

export const lookupQuerySchema = z.object({
  word: z
    .string()
    .trim()
    .min(1, 'Word cannot be empty')
    .max(100, 'Word is too long'),
});

export const suggestionsQuerySchema = z.object({
  query: z.string().trim().max(100).optional(),
});
