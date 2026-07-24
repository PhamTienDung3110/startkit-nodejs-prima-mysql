import { Request, Response, NextFunction } from 'express';
import { PendingTransactionService } from './pending-transaction.service';
import { updatePendingTransactionSchema } from './pending-transaction.schema';

export const PendingTransactionController = {
  // Public webhook logic (khi email forwarding gọi đến)
  inboundWebhook: async (req: Request, res: Response, next: NextFunction) => {
    try {
      let payload = req.body || {};
      
      if (typeof payload === 'string') {
        try {
          payload = JSON.parse(payload);
        } catch {
          payload = { text: payload };
        }
      }

      if (typeof payload !== 'object') {
        payload = { text: String(payload) };
      }
      
      const result = await PendingTransactionService.handleInboundEmail(payload);

      res.status(200).json({
        ok: true,
        message: 'Vietcombank email processed successfully',
        data: result
      });
    } catch (error: any) {
      console.error('[InboundWebhook Error]:', error);
      res.status(200).json({
        ok: false,
        message: error?.message || 'Error processing email webhook',
        error: String(error)
      });
    }
  },

  // Test endpoint cho phép người dùng dán text email để tự động thêm giao dịch
  testEmail: async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = req.user?.sub || (req.user as any)?.id;
      if (!userId) {
        res.status(401).json({ message: 'Unauthorized' });
        return;
      }

      const { text, emailText } = req.body;
      const rawText = text || emailText;

      if (!rawText) {
        res.status(400).json({ message: 'Vui lòng cung cấp nội dung email (text hoặc emailText)' });
        return;
      }

      const result = await PendingTransactionService.processEmailTextAndAutoAdd(userId, rawText);

      if (!result) {
        res.status(400).json({ message: 'Không trích xuất được thông tin số tiền từ nội dung email.' });
        return;
      }

      res.status(200).json({
        message: `Đã tự động thêm giao dịch Vietcombank (${result.transaction.amount.toLocaleString()}đ) vào ${result.walletName}`,
        data: result
      });
    } catch (error) {
      next(error);
    }
  },

  // GET /api/transactions/pending
  getPendingTransactions: async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = req.user?.sub || (req.user as any)?.id;
      if (!userId) {
        res.status(401).json({ message: 'Unauthorized' });
        return;
      }

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
      const userId = req.user?.sub || (req.user as any)?.id;
      if (!userId) {
        res.status(401).json({ message: 'Unauthorized' });
        return;
      }

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
