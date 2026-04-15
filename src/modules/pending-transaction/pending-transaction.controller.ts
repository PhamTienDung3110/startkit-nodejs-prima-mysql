import { Request, Response, NextFunction } from 'express';
import { PendingTransactionService } from './pending-transaction.service';
import { updatePendingTransactionSchema } from './pending-transaction.schema';

export const PendingTransactionController = {
  // Public webhook logic (không có requireAuth middleware)
  inboundWebhook: async (req: Request, res: Response, next: NextFunction) => {
    try {
      // Vì là webhook public từ Sendgrid/Mailgun nên không check req.user
      const payload = req.body;
      
      // Cho chạy ngầm không block response của mail server (trả 200 luôn)
      PendingTransactionService.handleInboundEmail(payload).catch(console.error);

      res.status(200).json({ ok: true });
    } catch (error) {
      next(error);
    }
  },

  // GET /api/transactions/pending
  getPendingTransactions: async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = req.user!.id;
      const transactions = await PendingTransactionService.getPendingTransactions(userId);
      res.status(200).json({
        message: 'Get pending transactions successfully',
        data: transactions
      });
    } catch (error) {
      next(error);
    }
  },

  // PATCH /api/transactions/pending/:id/status
  updateStatus: async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = req.user!.id;
      const id = req.params.id;
      const validatedData = updatePendingTransactionSchema.parse(req.body);
      
      const result = await PendingTransactionService.updateStatus(userId, id, validatedData.status as any);
      res.status(200).json({
        message: 'Status updated successfully',
        data: result
      });
    } catch (error) {
      next(error);
    }
  }
};
