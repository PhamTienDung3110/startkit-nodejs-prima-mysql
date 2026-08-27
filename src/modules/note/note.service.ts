/**
 * Note Service
 * Business logic cho NoteBook (Khóa học) và NoteSession (Buổi học)
 * Không import req/res – chỉ nhận dữ liệu thuần từ controller
 */
import { prisma } from '../../db/prisma';
import { CreateNotebookData, UpdateNotebookData, CreateSessionData, UpdateSessionData } from './note.schema';

/* ─── Helpers ─── */
function parseTags(raw: string): string[] {
  try { return JSON.parse(raw); } catch { return []; }
}

function serializeTags(tags: string[]): string {
  return JSON.stringify(tags);
}

/* ════════════════════════════════
   NOTEBOOK (Khóa học)
════════════════════════════════ */
export const NoteService = {

  /* ── LIST notebooks ── */
  async getNotebooks(userId: string) {
    const books = await prisma.noteBook.findMany({
      where: { userId },
      orderBy: { sortOrder: 'asc' },
      include: {
        _count: { select: { sessions: true } },
      },
    });
    return books.map((b) => ({
      id:           b.id,
      name:         b.name,
      emoji:        b.emoji,
      color:        b.color,
      description:  b.description,
      sortOrder:    b.sortOrder,
      sessionCount: (b as any)._count.sessions,
      createdAt:    b.createdAt.getTime(),
      updatedAt:    b.updatedAt.getTime(),
    }));
  },

  /* ── CREATE notebook ── */
  async createNotebook(data: CreateNotebookData, userId: string) {
    const book = await prisma.noteBook.create({
      data: {
        userId,
        name:        data.name,
        emoji:       data.emoji,
        color:       data.color,
        description: data.description,
        sortOrder:   data.sortOrder ?? 0,
      },
    });
    return {
      id:           book.id,
      name:         book.name,
      emoji:        book.emoji,
      color:        book.color,
      description:  book.description ?? undefined,
      sortOrder:    book.sortOrder,
      sessionCount: 0,
      createdAt:    book.createdAt.getTime(),
      updatedAt:    book.updatedAt.getTime(),
    };
  },

  /* ── UPDATE notebook ── */
  async updateNotebook(id: string, userId: string, data: UpdateNotebookData) {
    const exists = await prisma.noteBook.findFirst({ where: { id, userId } });
    if (!exists) throw new Error('NOT_FOUND');

    const book = await prisma.noteBook.update({
      where: { id },
      data: {
        ...(data.name        !== undefined && { name: data.name }),
        ...(data.emoji       !== undefined && { emoji: data.emoji }),
        ...(data.color       !== undefined && { color: data.color }),
        ...(data.description !== undefined && { description: data.description }),
        ...(data.sortOrder   !== undefined && { sortOrder: data.sortOrder }),
      },
      include: { _count: { select: { sessions: true } } },
    });
    return {
      id:           book.id,
      name:         book.name,
      emoji:        book.emoji,
      color:        book.color,
      description:  book.description ?? undefined,
      sortOrder:    book.sortOrder,
      sessionCount: (book as any)._count.sessions,
      createdAt:    book.createdAt.getTime(),
      updatedAt:    book.updatedAt.getTime(),
    };
  },

  /* ── DELETE notebook (cascade sessions) ── */
  async deleteNotebook(id: string, userId: string) {
    const exists = await prisma.noteBook.findFirst({ where: { id, userId } });
    if (!exists) throw new Error('NOT_FOUND');
    await prisma.noteBook.delete({ where: { id } });
    return { id };
  },

  /* ════════════════════════════════
     NOTE SESSION (Buổi học)
  ════════════════════════════════ */

  /* ── LIST sessions of a notebook ── */
  async getSessions(notebookId: string, userId: string) {
    // verify notebook belongs to user
    const book = await prisma.noteBook.findFirst({ where: { id: notebookId, userId } });
    if (!book) throw new Error('NOT_FOUND');

    const sessions = await prisma.noteSession.findMany({
      where: { notebookId, userId },
      orderBy: { updatedAt: 'desc' },
    });
    return sessions.map((s) => ({
      id:            s.id,
      notebookId:    s.notebookId,
      sessionNumber: s.sessionNumber,
      title:         s.title,
      date:          s.date,
      contentHtml:   s.contentHtml,
      tags:          parseTags(s.tags),
      createdAt:     s.createdAt.getTime(),
      updatedAt:     s.updatedAt.getTime(),
    }));
  },

  /* ── GET single session ── */
  async getSession(id: string, userId: string) {
    const s = await prisma.noteSession.findFirst({ where: { id, userId } });
    if (!s) throw new Error('NOT_FOUND');
    return {
      id:            s.id,
      notebookId:    s.notebookId,
      sessionNumber: s.sessionNumber,
      title:         s.title,
      date:          s.date,
      contentHtml:   s.contentHtml,
      tags:          parseTags(s.tags),
      createdAt:     s.createdAt.getTime(),
      updatedAt:     s.updatedAt.getTime(),
    };
  },

  /* ── CREATE session ── */
  async createSession(data: CreateSessionData, userId: string) {
    // Verify notebook belongs to user
    const book = await prisma.noteBook.findFirst({ where: { id: data.notebookId, userId } });
    if (!book) throw new Error('NOT_FOUND');

    // Auto-calculate sessionNumber if not provided
    let sessionNumber = data.sessionNumber;
    if (!sessionNumber) {
      const count = await prisma.noteSession.count({ where: { notebookId: data.notebookId } });
      sessionNumber = count + 1;
    }

    const s = await prisma.noteSession.create({
      data: {
        notebookId:    data.notebookId,
        userId,
        sessionNumber,
        title:         data.title,
        date:          data.date,
        contentHtml:   data.contentHtml,
        tags:          serializeTags(data.tags),
      },
    });

    // update notebook updatedAt
    await prisma.noteBook.update({ where: { id: data.notebookId }, data: { updatedAt: new Date() } });

    return {
      id:            s.id,
      notebookId:    s.notebookId,
      sessionNumber: s.sessionNumber,
      title:         s.title,
      date:          s.date,
      contentHtml:   s.contentHtml,
      tags:          parseTags(s.tags),
      createdAt:     s.createdAt.getTime(),
      updatedAt:     s.updatedAt.getTime(),
    };
  },

  /* ── UPDATE session ── */
  async updateSession(id: string, userId: string, data: UpdateSessionData) {
    const exists = await prisma.noteSession.findFirst({ where: { id, userId } });
    if (!exists) throw new Error('NOT_FOUND');

    const s = await prisma.noteSession.update({
      where: { id },
      data: {
        ...(data.title       !== undefined && { title: data.title }),
        ...(data.date        !== undefined && { date: data.date }),
        ...(data.contentHtml !== undefined && { contentHtml: data.contentHtml }),
        ...(data.tags        !== undefined && { tags: serializeTags(data.tags) }),
      },
    });

    // touch notebook updatedAt
    await prisma.noteBook.update({ where: { id: exists.notebookId }, data: { updatedAt: new Date() } });

    return {
      id:            s.id,
      notebookId:    s.notebookId,
      sessionNumber: s.sessionNumber,
      title:         s.title,
      date:          s.date,
      contentHtml:   s.contentHtml,
      tags:          parseTags(s.tags),
      createdAt:     s.createdAt.getTime(),
      updatedAt:     s.updatedAt.getTime(),
    };
  },

  /* ── DELETE session ── */
  async deleteSession(id: string, userId: string) {
    const exists = await prisma.noteSession.findFirst({ where: { id, userId } });
    if (!exists) throw new Error('NOT_FOUND');
    await prisma.noteSession.delete({ where: { id } });
    return { id };
  },
};
