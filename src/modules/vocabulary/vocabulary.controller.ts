import { Request, Response } from 'express';
import { VocabularyService } from './vocabulary.service';
import { handleError } from '../../utils/error-handler';

export class VocabularyController {
  static async getWords(req: Request, res: Response) {
    try {
      const userId = (req as any).user?.sub || 'default_user';
      const words = await VocabularyService.getWords(userId);
      return res.status(200).json({
        data: words,
      });
    } catch (err: any) {
      return handleError(err, res, 'Vocabulary');
    }
  }

  static async addWord(req: Request, res: Response) {
    try {
      const userId = (req as any).user?.sub || 'default_user';
      const { word, meaning, phonetics, audioUrl } = req.body;

      if (!word || !meaning) {
        return res.status(400).json({
          message: 'Từ và nghĩa là bắt buộc',
        });
      }

      const created = await VocabularyService.addWord(
        { word, meaning, phonetics, audioUrl },
        userId,
      );

      return res.status(201).json({
        data: created,
      });
    } catch (err: any) {
      return handleError(err, res, 'Vocabulary');
    }
  }

  static async updateWord(req: Request, res: Response) {
    try {
      const userId = (req as any).user?.sub || 'default_user';
      const { id } = req.params;
      await VocabularyService.updateWord(id, req.body, userId);

      return res.status(200).json({
        message: 'Cập nhật từ vựng thành công',
      });
    } catch (err: any) {
      return handleError(err, res, 'Vocabulary');
    }
  }

  static async deleteWord(req: Request, res: Response) {
    try {
      const userId = (req as any).user?.sub || 'default_user';
      const { id } = req.params;
      await VocabularyService.deleteWord(id, userId);

      return res.status(200).json({
        message: 'Xóa từ vựng thành công',
      });
    } catch (err: any) {
      return handleError(err, res, 'Vocabulary');
    }
  }

  static async markLearned(req: Request, res: Response) {
    try {
      const userId = (req as any).user?.sub || 'default_user';
      const { id } = req.params;
      const { isCorrect } = req.body;

      const updated = await VocabularyService.markLearned(id, Boolean(isCorrect), userId);

      return res.status(200).json({
        data: updated,
      });
    } catch (err: any) {
      return handleError(err, res, 'Vocabulary');
    }
  }
}
