/**
 * Transaction Controller
 * File này xử lý HTTP requests/responses cho các transaction endpoints
 * Controller layer - chỉ xử lý HTTP, business logic nằm ở Service layer
 */
import { Request, Response } from 'express';
import { TransactionService } from './transaction.service';
import { handleError } from '../../utils/error-handler';

// Create module-specific error handler
const handleTransactionError = (error: any, res: Response) =>
  handleError(error, res, 'Transaction');

export const TransactionController = {
  /**
   * @swagger
   * /transactions:
   *   post:
   *     tags:
   *       - Transactions
   *     summary: Tạo giao dịch mới
   *     description: Tạo giao dịch thu tiền, chi tiền hoặc chuyển tiền
   *     security:
   *       - bearerAuth: []
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             oneOf:
   *               - $ref: '#/components/schemas/IncomeTransaction'
   *               - $ref: '#/components/schemas/ExpenseTransaction'
   *               - $ref: '#/components/schemas/TransferTransaction'
   *             discriminator:
   *               propertyName: type
   *     responses:
   *       201:
   *         description: Giao dịch được tạo thành công
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 message:
   *                   type: string
   *                   example: "Transaction created successfully"
   *                 transaction:
   *                   $ref: '#/components/schemas/Transaction'
   *       400:
   *         description: Dữ liệu không hợp lệ
   *       404:
   *         description: Ví hoặc danh mục không tồn tại
   *       401:
   *         description: Chưa đăng nhập
   */
  async createTransaction(req: Request, res: Response) {
    try {
      // Lấy userId từ JWT token (được gắn bởi auth middleware)
      const userId = req.user?.sub;
      if (!userId) {
        return res.status(401).json({ message: 'Unauthorized' });
      }

      // Gọi service để tạo transaction
      const transaction = await TransactionService.createTransaction(req.body, userId);

      // Trả về transaction đã tạo với status 201
      return res.status(201).json({
        message: 'Transaction created successfully',
        transaction
      });
    } catch (e: any) {
      return handleTransactionError(e, res);
    }
  },

  /**
   * Lấy danh sách giao dịch của user
   * GET /api/transactions
   *
   * Query parameters (tất cả optional):
   * - type: 'income' | 'expense' | 'transfer'
   * - startDate: ISO date string
   * - endDate: ISO date string
   * - categoryId: UUID string
   * - walletId: UUID string
   * - limit: number (default 50)
   * - offset: number (default 0)
   *
   * @param req.query - Các filter parameters
   * @param req.user.id - User ID từ JWT token
   * @returns 200 OK với danh sách transactions và pagination info
   */
  async getTransactions(req: Request, res: Response) {
    try {
      // Lấy userId từ JWT token
      const userId = req.user?.sub;
      if (!userId) {
        return res.status(401).json({ message: 'Unauthorized' });
      }

      // Parse query parameters
      const excludeLoanRelated = req.query.excludeLoanRelated === 'true' || req.query.excludeLoanRelated === '1';
      const filters = {
        type: req.query.type as 'income' | 'expense' | 'transfer' | undefined,
        startDate: req.query.startDate ? new Date(req.query.startDate as string) : undefined,
        endDate: req.query.endDate ? new Date(req.query.endDate as string) : undefined,
        categoryId: req.query.categoryId as string | undefined,
        walletId: req.query.walletId as string | undefined,
        limit: req.query.limit ? parseInt(req.query.limit as string) : 50,
        offset: req.query.offset ? parseInt(req.query.offset as string) : 0,
        excludeLoanRelated
      };

      // Validate limit và offset
      if (filters.limit && (filters.limit < 1 || filters.limit > 100)) {
        return res.status(400).json({ message: 'Limit must be between 1 and 100' });
      }
      if (filters.offset && filters.offset < 0) {
        return res.status(400).json({ message: 'Offset must be non-negative' });
      }

      // Validate date formats
      if (filters.startDate && isNaN(filters.startDate.getTime())) {
        return res.status(400).json({ message: 'Invalid startDate format' });
      }
      if (filters.endDate && isNaN(filters.endDate.getTime())) {
        return res.status(400).json({ message: 'Invalid endDate format' });
      }

      // Gọi service để lấy transactions
      const result = await TransactionService.getTransactions(userId, filters);

      // Trả về kết quả
      return res.status(200).json({
        message: 'Transactions retrieved successfully',
        ...result
      });
    } catch (e: any) {
      console.error('Get transactions error:', e);
      return res.status(500).json({ message: 'Internal server error' });
    }
  }
};
