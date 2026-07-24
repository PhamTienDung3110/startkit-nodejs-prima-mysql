import { prisma } from '../../db/prisma';
import { PendingTransactionStatus, TransactionType } from '@prisma/client';
import { logger } from '../../config/logger';
import { VCBParser, ParsedVCBTransaction } from './vcb-parser.service';
import { TransactionService } from '../transaction/transaction.service';

/**
 * Tìm hoặc tự động tạo Ví Vietcombank cho User
 */
async function findOrCreateBankWallet(userId: string) {
  // 1. Tự động bỏ Ẩn ví 'VCB' nếu đang bị Archived
  const archivedVcb = await prisma.wallet.findFirst({
    where: { userId, name: { equals: 'VCB' } }
  });
  if (archivedVcb && archivedVcb.isArchived) {
    await prisma.wallet.update({
      where: { id: archivedVcb.id },
      data: { isArchived: false }
    });
  }

  // 2. Tìm ví ACTIVE có tên VCB / Vietcombank / type bank
  let wallet = await prisma.wallet.findFirst({
    where: {
      userId,
      isArchived: false,
      OR: [
        { name: { equals: 'VCB' } },
        { name: { contains: 'VCB' } },
        { name: { contains: 'Vietcombank' } },
        { type: 'bank' }
      ]
    }
  });

  // 3. Nếu không có ví bank active, lấy bất kỳ ví ACTIVE nào thuộc về user
  if (!wallet) {
    wallet = await prisma.wallet.findFirst({
      where: { userId, isArchived: false }
    });
  }

  // 4. Nếu chưa có ví, tự động tạo mới Ví 'VCB'
  if (!wallet) {
    try {
      wallet = await prisma.wallet.create({
        data: {
          userId,
          name: 'VCB',
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
          name: `VCB ${Math.floor(Math.random() * 1000)}`,
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

async function findOrCreateSmartCategory(userId: string, type: 'income' | 'expense', note: string = '') {
  const lowerNote = note.toLowerCase();

  let targetName = type === 'income' ? 'Thu nhập Ngân hàng' : 'Chi tiêu Vietcombank';
  let targetIcon = type === 'income' ? 'wallet' : 'credit-card';

  // Quy tắc từ khóa tự động phân loại danh mục
  if (lowerNote.includes('pipi')) {
    targetName = 'Pipi';
    targetIcon = 'heart';
  } else if (
    lowerNote.includes('an') ||
    lowerNote.includes('com') ||
    lowerNote.includes('pho') ||
    lowerNote.includes('bun') ||
    lowerNote.includes('ca phe') ||
    lowerNote.includes('cf') ||
    lowerNote.includes('coffee') ||
    lowerNote.includes('tra sua') ||
    lowerNote.includes('food')
  ) {
    targetName = 'Ăn uống';
    targetIcon = 'utensils';
  } else if (
    lowerNote.includes('xang') ||
    lowerNote.includes('grab') ||
    lowerNote.includes('be') ||
    lowerNote.includes('gojek') ||
    lowerNote.includes('taxi') ||
    lowerNote.includes('ve xe')
  ) {
    targetName = 'Di chuyển';
    targetIcon = 'car';
  } else if (
    lowerNote.includes('dien') ||
    lowerNote.includes('nuoc') ||
    lowerNote.includes('wifi') ||
    lowerNote.includes('internet') ||
    lowerNote.includes('cuoc') ||
    lowerNote.includes('hoa don')
  ) {
    targetName = 'Hóa đơn & Dịch vụ';
    targetIcon = 'receipt';
  } else if (
    lowerNote.includes('mua') ||
    lowerNote.includes('shopper') ||
    lowerNote.includes('lazada') ||
    lowerNote.includes('tiki') ||
    lowerNote.includes('sieu thi') ||
    lowerNote.includes('mart')
  ) {
    targetName = 'Mua sắm';
    targetIcon = 'shopping-bag';
  } else if (type === 'income' && (lowerNote.includes('luong') || lowerNote.includes('thuong') || lowerNote.includes('nhan tien'))) {
    targetName = 'Lương';
    targetIcon = 'wallet';
  }

  // 1. Tìm danh mục chính xác theo tên targetName của user
  let category = await prisma.category.findFirst({
    where: { userId, type, name: targetName }
  });

  // 2. Tìm danh mục chứa tên targetName của user
  if (!category) {
    category = await prisma.category.findFirst({
      where: { userId, type, name: { contains: targetName } }
    });
  }

  // 3. Nếu chưa có, tự động tạo mới danh mục này cho user
  if (!category) {
    try {
      category = await prisma.category.create({
        data: {
          userId,
          type,
          name: targetName,
          icon: targetIcon,
          isSystem: false
        }
      });
    } catch {
      category = await prisma.category.findFirst({ where: { userId, type } });
    }
  }

  // 4. Fallback: Lấy bất kỳ danh mục nào hợp lệ của user cùng loại (thu/chi)
  if (!category) {
    category = await prisma.category.findFirst({ where: { userId, type } });
  }

  if (!category) {
    category = await prisma.category.findFirst({ where: { type } });
  }

  // 5. Ultimate fallback: Tạo danh mục mặc định
  if (!category) {
    category = await prisma.category.create({
      data: {
        userId,
        type,
        name: targetName,
        icon: targetIcon,
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

    // 3. Tìm hoặc tạo Danh mục thu/chi thông minh theo từ khóa (bao gồm pipi, ăn uống, di chuyển, hóa đơn...)
    const category = await findOrCreateSmartCategory(userId, parsed.type === 'income' ? 'income' : 'expense', parsed.note);

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
