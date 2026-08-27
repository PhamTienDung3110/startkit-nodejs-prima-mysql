/**
 * Note Controller
 * HTTP request handler cho NoteBook và NoteSession endpoints
 */
import { Request, Response } from 'express';
import { NoteService } from './note.service';
import { handleError } from '../../utils/error-handler';

const handleNoteError = (error: any, res: Response) => {
  if (error?.message === 'NOT_FOUND') {
    return res.status(404).json({ message: 'Không tìm thấy tài nguyên' });
  }
  return handleError(error, res, 'Note');
};

export const NoteController = {

  /* ════ NOTEBOOK ════ */

  /** GET /notebooks */
  async getNotebooks(req: Request, res: Response) {
    try {
      const userId = req.user?.sub;
      if (!userId) return res.status(401).json({ message: 'Unauthorized' });

      const notebooks = await NoteService.getNotebooks(userId);
      return res.status(200).json({ message: 'OK', data: notebooks });
    } catch (e) { return handleNoteError(e, res); }
  },

  /** POST /notebooks */
  async createNotebook(req: Request, res: Response) {
    try {
      const userId = req.user?.sub;
      if (!userId) return res.status(401).json({ message: 'Unauthorized' });

      const notebook = await NoteService.createNotebook(req.body, userId);
      return res.status(201).json({ message: 'Khóa học đã được tạo', data: notebook });
    } catch (e) { return handleNoteError(e, res); }
  },

  /** PUT /notebooks/:id */
  async updateNotebook(req: Request, res: Response) {
    try {
      const userId = req.user?.sub;
      if (!userId) return res.status(401).json({ message: 'Unauthorized' });

      const notebook = await NoteService.updateNotebook(req.params.id, userId, req.body);
      return res.status(200).json({ message: 'Cập nhật thành công', data: notebook });
    } catch (e) { return handleNoteError(e, res); }
  },

  /** DELETE /notebooks/:id */
  async deleteNotebook(req: Request, res: Response) {
    try {
      const userId = req.user?.sub;
      if (!userId) return res.status(401).json({ message: 'Unauthorized' });

      await NoteService.deleteNotebook(req.params.id, userId);
      return res.status(200).json({ message: 'Xóa khóa học thành công' });
    } catch (e) { return handleNoteError(e, res); }
  },

  /* ════ NOTE SESSION ════ */

  /** GET /notebooks/:notebookId/sessions */
  async getSessions(req: Request, res: Response) {
    try {
      const userId = req.user?.sub;
      if (!userId) return res.status(401).json({ message: 'Unauthorized' });

      const sessions = await NoteService.getSessions(req.params.notebookId, userId);
      return res.status(200).json({ message: 'OK', data: sessions });
    } catch (e) { return handleNoteError(e, res); }
  },

  /** POST /note-sessions */
  async createSession(req: Request, res: Response) {
    try {
      const userId = req.user?.sub;
      if (!userId) return res.status(401).json({ message: 'Unauthorized' });

      const session = await NoteService.createSession(req.body, userId);
      return res.status(201).json({ message: 'Buổi học đã được tạo', data: session });
    } catch (e) { return handleNoteError(e, res); }
  },

  /** PUT /note-sessions/:id */
  async updateSession(req: Request, res: Response) {
    try {
      const userId = req.user?.sub;
      if (!userId) return res.status(401).json({ message: 'Unauthorized' });

      const session = await NoteService.updateSession(req.params.id, userId, req.body);
      return res.status(200).json({ message: 'Cập nhật thành công', data: session });
    } catch (e) { return handleNoteError(e, res); }
  },

  /** DELETE /note-sessions/:id */
  async deleteSession(req: Request, res: Response) {
    try {
      const userId = req.user?.sub;
      if (!userId) return res.status(401).json({ message: 'Unauthorized' });

      await NoteService.deleteSession(req.params.id, userId);
      return res.status(200).json({ message: 'Xóa buổi học thành công' });
    } catch (e) { return handleNoteError(e, res); }
  },
};
