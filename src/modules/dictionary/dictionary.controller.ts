import { Request, Response } from 'express';
import { DictionaryService } from './dictionary.service';
import { lookupQuerySchema, suggestionsQuerySchema } from './dictionary.schema';
import { handleError } from '../../utils/error-handler';

export const DictionaryController = {
  /**
   * Tra cứu từ vựng
   * GET /api/dictionary/lookup?word=...
   */
  async lookup(req: Request, res: Response) {
    try {
      const parsed = lookupQuerySchema.safeParse(req.query);
      if (!parsed.success) {
        return res.status(400).json({
          message: 'Invalid input',
          errors: parsed.error.issues,
        });
      }

      const result = await DictionaryService.lookup(parsed.data.word);
      return res.status(200).json({
        data: result,
      });
    } catch (error: any) {
      return handleError(error, res, 'DictionaryLookup');
    }
  },

  /**
   * Lấy gợi ý từ vựng từ database
   * GET /api/dictionary/suggestions?query=...
   */
  async getSuggestions(req: Request, res: Response) {
    try {
      const parsed = suggestionsQuerySchema.safeParse(req.query);
      const query = parsed.success && parsed.data.query ? parsed.data.query : '';
      const suggestions = await DictionaryService.getSuggestions(query);
      return res.status(200).json({
        data: suggestions,
      });
    } catch (error: any) {
      return handleError(error, res, 'DictionarySuggestions');
    }
  },

  /**
   * Lấy danh sách từ khóa phổ biến / đã tra cứu gần đây
   * GET /api/dictionary/popular
   */
  async getPopular(req: Request, res: Response) {
    try {
      const words = await DictionaryService.getPopularWords();
      return res.status(200).json({
        data: words,
      });
    } catch (error: any) {
      return handleError(error, res, 'DictionaryPopular');
    }
  },
};
