import prisma from '../../db/prisma';
import { PendingTransactionStatus, TransactionType } from '@prisma/client';
import { logger } from '../../config/logger';

// Giả lập thư viện LLM hoặc dùng fetch API
async function parseEmailWithLLM(text: string) {
  // Trong thực tế, bạn gọi LLM API ở đây (Gemini/OpenAI)
  // Ví dụ: const response = await llm.generate(...)
  // Dưới đây là dữ liệu giả lập (Mock) sinh ra bởi AI
  logger.info('Calling LLM to parse email text...');
  
  const lowers = text.toLowerCase();
  let type: TransactionType = 'expense';
  let amount = 0;
  let note = 'Parsed from email';
  let bankName = 'Unknown Bank';

  // Demo parsing logic ngây ngô để fallback nếu không có api key
  if (lowers.includes('vcb') || lowers.includes('vietcombank')) bankName = 'Vietcombank';
  if (lowers.includes('tpbank')) bankName = 'TPBank';
  
  if (lowers.includes('+') || lowers.includes('cộng')) type = 'income';
  
  const amountMatch = text.match(/([\d,\.]+)\s*(vnd|đ|d)/i);
  if (amountMatch) {
    amount = parseFloat(amountMatch[1].replace(/,/g, ''));
  }

  return {
    parsedAmount: amount > 0 ? amount : null,
    parsedType: type,
    parsedNote: note,
    bankName
  };
}

export const PendingTransactionService = {
  async handleInboundEmail(payload: any) {
    try {
      const recipient = payload.recipient || '';
      const text = payload.text || payload['body-plain'] || '';
      
      if (!text) {
        logger.warn('No text found in inbound email webhok');
        return;
      }

      // 1. Phân tích userId từ recipient address (VD: sync+user-uuid@inbox.app.com)
      // recipient format: sync+<userId>@inbox.app.com
      const match = recipient.match(/sync\+([^@]+)@/);
      const targetUserId = match ? match[1] : null;

      if (!targetUserId) {
        // Nếu không tìm thấy userId ở dạng chuẩn, ta drop hoặc log
        logger.error(`Could not extract userId from recipient: ${recipient}`);
        return;
      }

      // Check xem user có tồn tại không
      const user = await prisma.user.findUnique({ where: { id: targetUserId } });
      if (!user) {
        logger.error(`User ID ${targetUserId} not found for inbound email`);
        return;
      }

      // 2. Dùng AI Parse text
      const parsedData = await parseEmailWithLLM(text);

      // 3. Insert vào Database
      await prisma.pendingTransaction.create({
        data: {
          userId: targetUserId,
          rawEmailText: text,
          parsedAmount: parsedData.parsedAmount,
          parsedType: parsedData.parsedType,
          parsedNote: parsedData.parsedNote,
          bankName: parsedData.bankName,
          status: 'pending'
        }
      });
      logger.info(`Successfully created pending transaction for user ${targetUserId}`);
    } catch (error) {
      logger.error('Error handling inbound email:', error);
      throw error;
    }
  },

  async getPendingTransactions(userId: string) {
    return prisma.pendingTransaction.findMany({
      where: {
        userId,
        status: 'pending'
      },
      orderBy: {
        createdAt: 'desc'
      }
    });
  },

  async updateStatus(userId: string, id: string, status: PendingTransactionStatus) {
    return prisma.pendingTransaction.update({
      where: {
        id,
        userId // đảm bảo chỉ update của đúng user
      },
      data: {
        status
      }
    });
  }
};
