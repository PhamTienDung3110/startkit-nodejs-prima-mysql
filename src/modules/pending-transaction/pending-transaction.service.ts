import { prisma } from '../../db/prisma';
import { PendingTransactionStatus, TransactionType } from '@prisma/client';
import { logger } from '../../config/logger';
import { VCBParser, ParsedVCBTransaction } from './vcb-parser.service';
import { TransactionService } from '../transaction/transaction.service';

/**
 * Tìm hoặc tự động tạo Ví Vietcombank cho User
 */
async function findOrCreateBankWallet(userId: string) {
  // 1. Ưu tiên tìm ví ACTIVE (isArchived: false) có chứa tên Vietcombank / VCB / bank
  let wallet = await prisma.wallet.findFirst({
    where: {
      userId,
      isArchived: false,
      OR: [
        { name: { contains: 'Vietcombank' } },
        { name: { contains: 'VCB' } },
        { type: 'bank' }
      ]
    }
  });

  // 2. Nếu không thấy ví bank active, tìm bất kỳ ví ACTIVE nào thuộc về user
  if (!wallet) {
    wallet = await prisma.wallet.findFirst({
      where: { userId, isArchived: false }
    });
  }

  // 3. Nếu không thấy ví active nào, thử unarchive một ví ngân hàng cũ
  if (!wallet) {
    const archivedWallet = await prisma.wallet.findFirst({
      where: {
        userId,
        OR: [
          { name: { contains: 'Vietcombank' } },
          { name: { contains: 'VCB' } },
          { type: 'bank' }
        ]
      }
    });

    if (archivedWallet) {
      wallet = await prisma.wallet.update({
        where: { id: archivedWallet.id },
        data: { isArchived: false }
      });
    }
  }

  // 4. Tự động tạo Ví Vietcombank mới nếu user chưa có ví active
  if (!wallet) {
    try {
      wallet = await prisma.wallet.create({
        data: {
          userId,
          name: 'Ví Vietcombank',
          type: 'bank',
          openingBalance: 0,
          currentBalance: 0,
          isArchived: false
        }
      });
    } catch {
      wallet = await prisma.wallet.create({
        data: {
          userId,
          name: `Ví Vietcombank ${Math.floor(Math.random() * 1000)}`,
          type: 'bank',
          openingBalance: 0,
          currentBalance: 0,
          isArchived: false
        }
      });
    }
  }

  return wallet;
}

async function findOrCreateDefaultCategory(userId: string, type: 'income' | 'expense') {
  let category = await prisma.category.findFirst({
    where: { userId, type }
  });

  if (!category) {
    try {
      category = await prisma.category.create({
        data: {
          userId,
          type,
          name: type === 'income' ? 'Thu nhập Ngân hàng' : 'Chi tiêu Ngân hàng',
          isSystem: true
        }
      });
    } catch {
      category = await prisma.category.findFirst({ where: { userId, type } });
    }
  }

  if (!category) {
    category = await prisma.category.findFirst({ where: { type } });
  }

  if (!category) {
    category = await prisma.category.create({
      data: {
        userId,
        type,
        name: `Danh mục ${type === 'income' ? 'Thu' : 'Chi'} ${Math.floor(Math.random() * 1000)}`,
        isSystem: true
      }
    });
  }

  return category;
}

export const PendingTransactionService = {
  /**
   * Xử lý Email Webhook nhận từ quy tắc chuyển tiếp (Auto-Forward)
   */
  async handleInboundEmail(payload: any) {
    try {
      const recipient = payload.recipient || payload.to || '';
      const text = payload.text || payload['body-plain'] || payload.html || payload.subject || '';
      
      if (!text) {
        logger.warn('No text found in inbound email webhook');
        return null;
      }

      // 1. Phân tích userId từ recipient address (VD: sync+user-uuid@inbox.app.com)
      const match = recipient.match(/sync\+([^@]+)@/);
      let targetUserId = match ? match[1] : null;

      // Nếu truyền kèm userId hoặc userEmail trong payload
      if (!targetUserId && payload.userId) {
        targetUserId = payload.userId;
      }

      // Tìm user theo email nếu nhận được từ Google Apps Script / Webhook
      if (!targetUserId) {
        const emailInPayload = payload.userEmail || payload.recipient || payload.to || payload.from;
        if (emailInPayload) {
          const emailMatch = String(emailInPayload).match(/([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/);
          if (emailMatch) {
            const foundUser = await prisma.user.findFirst({
              where: { email: emailMatch[1] }
            });
            if (foundUser) targetUserId = foundUser.id;
          }
        }
      }

      if (!targetUserId) {
        // Fallback: Tìm user đầu tiên trong DB để test nếu không có recipient token
        const firstUser = await prisma.user.findFirst();
        if (firstUser) {
          targetUserId = firstUser.id;
        } else {
          logger.error(`Could not extract userId from recipient: ${recipient}`);
          return null;
        }
      }

      const user = await prisma.user.findUnique({ where: { id: targetUserId } });
      if (!user) {
        logger.error(`User ID ${targetUserId} not found for inbound email`);
        return null;
      }

      return await this.processEmailTextAndAutoAdd(targetUserId, text);
    } catch (error) {
      logger.error(error as any, 'Error handling inbound email');
      throw error;
    }
  },

  /**
   * Phân tích văn bản Email và TỰ ĐỘNG THÊM thẳng vào Ví Ngân Hàng
   */
  async processEmailTextAndAutoAdd(userId: string, rawText: string) {
    // 1. Parse văn bản bằng VCBParser
    let parsed = VCBParser.parse(rawText);

    // Fallback nếu không có cấu trúc chuẩn VCB
    if (!parsed || !parsed.amount) {
      const lowers = rawText.toLowerCase();
      let type: TransactionType = lowers.includes('+') || lowers.includes('cộng') ? 'income' : 'expense';
      const amountMatch = rawText.match(/([\d,\.]+)\s*(vnd|đ|d)/i);
      const amount = amountMatch ? parseFloat(amountMatch[1].replace(/,/g, '')) : 0;

      if (amount > 0) {
        parsed = {
          amount,
          type,
          note: 'Giao dịch Vietcombank',
          transactionDate: new Date(),
          bankName: 'Vietcombank',
          rawText
        };
      }
    }

    if (!parsed || !parsed.amount) {
      logger.warn('Failed to parse amount from email text');
      return null;
    }

    // 2. Tìm hoặc tạo Ví Vietcombank
    const wallet = await findOrCreateBankWallet(userId);

    // 3. Tìm hoặc tạo Danh mục thu/chi
    const category = await findOrCreateDefaultCategory(userId, parsed.type === 'income' ? 'income' : 'expense');

    // 4. TỰ ĐỘNG THÊM GIAO DỊCH CHÍNH THỨC VÀO VÍ NGÂN HÀNG
    const newTransaction = await TransactionService.createTransaction(
      {
        type: parsed.type as 'income' | 'expense',
        walletId: wallet.id,
        categoryId: category.id,
        amount: parsed.amount,
        transactionDate: parsed.transactionDate,
        note: parsed.note
      },
      userId,
      true // Bỏ qua kiểm tra số dư khi tự động đồng bộ từ ngân hàng
    );

    // 5. Lưu lại lịch sử giao dịch tự động đồng bộ (PendingTransaction -> status: approved)
    let pendingLog = null;
    try {
      pendingLog = await prisma.pendingTransaction.create({
        data: {
          userId,
          rawEmailText: rawText,
          parsedAmount: parsed.amount,
          parsedType: parsed.type,
          parsedNote: parsed.note,
          bankName: parsed.bankName,
          status: 'approved'
        }
      });
    } catch (logErr) {
      logger.warn(logErr as any, 'Could not create PendingTransaction log entry');
    }

    logger.info(`Auto-created transaction ${newTransaction.id} from Vietcombank email for user ${userId}`);

    return {
      transaction: newTransaction,
      pendingLog,
      walletName: wallet.name
    };
  },

  /**
   * Lấy danh sách lịch sử giao dịch tự động đồng bộ từ email
   */
  async getPendingTransactions(userId: string) {
    return prisma.pendingTransaction.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 20
    });
  },

  /**
   * Cập nhật trạng thái
   */
  async updateStatus(userId: string, id: string, status: PendingTransactionStatus) {
    return prisma.pendingTransaction.update({
      where: { id, userId },
      data: { status }
    });
  }
};
