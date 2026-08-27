/**
 * Note Schema Validation
 * Zod schemas cho NoteBook (Khóa học) và NoteSession (Buổi học)
 */
import { z } from 'zod';

/* ── NoteBook ── */
export const createNotebookSchema = z.object({
  name:        z.string().min(1, 'Tên khóa học không được rỗng').max(200),
  emoji:       z.string().max(10).default('📘'),
  color:       z.string().max(30).default('violet'),
  description: z.string().max(1000).optional(),
  sortOrder:   z.number().int().min(0).optional().default(0),
});

export const updateNotebookSchema = z.object({
  name:        z.string().min(1).max(200).optional(),
  emoji:       z.string().max(10).optional(),
  color:       z.string().max(30).optional(),
  description: z.string().max(1000).optional(),
  sortOrder:   z.number().int().min(0).optional(),
}).refine(
  (d) => Object.values(d).some((v) => v !== undefined),
  'Phải cung cấp ít nhất một trường'
);

/* ── NoteSession ── */
export const createSessionSchema = z.object({
  notebookId:    z.string().uuid('notebookId phải là UUID'),
  title:         z.string().min(1).max(300).default('Untitled'),
  date:          z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'date phải là YYYY-MM-DD').default(() => new Date().toISOString().slice(0, 10)),
  contentHtml:   z.string().default(''),
  tags:          z.array(z.string().max(50)).default([]),
  sessionNumber: z.number().int().min(1).optional(), // nếu không truyền, BE tự tính
});

export const updateSessionSchema = z.object({
  title:       z.string().min(1).max(300).optional(),
  date:        z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  contentHtml: z.string().optional(),
  tags:        z.array(z.string().max(50)).optional(),
}).refine(
  (d) => Object.values(d).some((v) => v !== undefined),
  'Phải cung cấp ít nhất một trường'
);

/* ── Types ── */
export type CreateNotebookData = z.infer<typeof createNotebookSchema>;
export type UpdateNotebookData = z.infer<typeof updateNotebookSchema>;
export type CreateSessionData  = z.infer<typeof createSessionSchema>;
export type UpdateSessionData  = z.infer<typeof updateSessionSchema>;
