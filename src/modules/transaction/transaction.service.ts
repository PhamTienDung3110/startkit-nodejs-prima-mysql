/**
 * Transaction Service
 * File này chứa business logic cho việc quản lý giao dịch tài chính
 * Service layer - xử lý logic nghiệp vụ, không liên quan đến HTTP
 *
 * Logic nghiệp vụ quan trọng:
 * - Income: 1 entry (in) vào wallet, tăng currentBalance
 * - Expense: 1 entry (out) từ wallet, giảm currentBalance
 * - Transfer: 2 entries (out từ wallet A, in vào wallet B), balance thay đổi tương ứng
 * - Tất cả operations phải atomic (sử dụng DB transaction)
 */
import { prisma } from '../../db/prisma';
import { CreateTransactionData } from './transaction.schema';

/**
 * Validate wallet ownership and check sufficient balance for debit operations
 * Đảm bảo wallet thuộc về user hiện tại và có đủ số dư
 */
async function validateWalletOwnership(walletId: string, userId: string, requiredAmount?: number) {
  const wallet = await prisma.wallet.findFirst({
    where: { id: walletId, userId, isArchived: false }
  });
  if (!wallet) {
    throw new Error('TRANSACTION_WALLET_NOT_FOUND');
  }

  // Kiểm tra số dư nếu cần trừ tiền (expense hoặc transfer out)
  if (requiredAmount !== undefined && wallet.currentBalance.toNumber() < requiredAmount) {
    throw new Error('INSUFFICIENT_WALLET_BALANCE');
  }

  return wallet;
}

/**
 * Validate category ownership (chỉ cho income/expense)
 * Đảm bảo category thuộc về user và có type phù hợp
 */
async function validateCategoryOwnership(categoryId: string, userId: string, transactionType: string) {
  const category = await prisma.category.findFirst({
    where: { id: categoryId, userId }
  });
  if (!category) {
    throw new Error('TRANSACTION_CATEGORY_NOT_FOUND');
  }

  // Income/Expense phải dùng category có type tương ứng
  if (transactionType === 'income' && category.type !== 'income') {
    throw new Error('INVALID_CATEGORY_TYPE_FOR_INCOME');
  }
  if (transactionType === 'expense' && category.type !== 'expense') {
    throw new Error('INVALID_CATEGORY_TYPE_FOR_EXPENSE');
  }

  return category;
}

/**
 * Tạo Income transaction
 * Logic: 1 entry (direction: in) vào wallet, tăng currentBalance
 */
async function createIncomeTransaction(data: CreateTransactionData & { type: 'income' }, userId: string) {
  const { walletId, categoryId, transactionDate, amount, note } = data;

  // Validate wallet và category
  await validateWalletOwnership(walletId, userId);
  await validateCategoryOwnership(categoryId!, userId, 'income');

  // Tạo transaction và entry trong DB transaction
  return await prisma.$transaction(async (tx) => {
    // 1. Tạo Transaction header
    const transaction = await tx.transaction.create({
      data: {
        userId,
        type: 'income',
        transactionDate,
        categoryId,
        amount,
        note,
        entries: {
          create: {
            walletId,
            direction: 'in',
            amount
          }
        }
      },
      include: {
        entries: true,
        category: true
      }
    });

    // 2. Cập nhật currentBalance của wallet (tăng)
    await tx.wallet.update({
      where: { id: walletId },
      data: {
        currentBalance: {
          increment: amount
        }
      }
    });

    return transaction;
  });
}

/**
 * Tạo Expense transaction
 * Logic: 1 entry (direction: out) từ wallet, giảm currentBalance
 * Kiểm tra số dư trước khi thực hiện
 */
async function createExpenseTransaction(data: CreateTransactionData & { type: 'expense' }, userId: string) {
  const { walletId, categoryId, transactionDate, amount, note } = data;

  // Validate wallet và kiểm tra số dư
  await validateWalletOwnership(walletId, userId, amount);
  await validateCategoryOwnership(categoryId!, userId, 'expense');

  // Tạo transaction và entry trong DB transaction
  return await prisma.$transaction(async (tx) => {
    // Kiểm tra lại số dư trong transaction để tránh race condition
    const wallet = await tx.wallet.findUnique({
      where: { id: walletId },
      select: { currentBalance: true }
    });

    if (!wallet || wallet.currentBalance.toNumber() < amount) {
      throw new Error('INSUFFICIENT_WALLET_BALANCE');
    }

    // 1. Tạo Transaction header
    const transaction = await tx.transaction.create({
      data: {
        userId,
        type: 'expense',
        transactionDate,
        categoryId,
        amount,
        note,
        entries: {
          create: {
            walletId,
            direction: 'out',
            amount
          }
        }
      },
      include: {
        entries: true,
        category: true
      }
    });

    // 2. Cập nhật currentBalance của wallet (giảm)
    await tx.wallet.update({
      where: { id: walletId },
      data: {
        currentBalance: {
          decrement: amount
        }
      }
    });

    return transaction;
  });
}

/**
 * Tạo Transfer transaction
 * Logic: 2 entries (out từ fromWallet, in vào toWallet), balance thay đổi tương ứng
 * Kiểm tra số dư ví nguồn trước khi thực hiện
 */
async function createTransferTransaction(data: CreateTransactionData & { type: 'transfer' }, userId: string) {
  const { fromWalletId, toWalletId, transactionDate, amount, note } = data;

  // Validate: fromWalletId !== toWalletId
  if (fromWalletId === toWalletId) {
    throw new Error('SAME_WALLET_TRANSFER');
  }

  // Validate cả 2 wallet, kiểm tra số dư ví nguồn
  await validateWalletOwnership(fromWalletId, userId, amount);
  await validateWalletOwnership(toWalletId, userId);

  // Tạo transaction và entries trong DB transaction
  return await prisma.$transaction(async (tx) => {
    // Kiểm tra lại số dư ví nguồn trong transaction để tránh race condition
    const fromWallet = await tx.wallet.findUnique({
      where: { id: fromWalletId },
      select: { currentBalance: true }
    });

    if (!fromWallet || fromWallet.currentBalance.toNumber() < amount) {
      throw new Error('INSUFFICIENT_WALLET_BALANCE');
    }

    // 1. Tạo Transaction header (transfer không có category)
    const transaction = await tx.transaction.create({
      data: {
        userId,
        type: 'transfer',
        transactionDate,
        amount,
        note,
        entries: {
          create: [
            // Entry out từ ví nguồn
            {
              walletId: fromWalletId,
              direction: 'out',
              amount
            },
            // Entry in vào ví đích
            {
              walletId: toWalletId,
              direction: 'in',
              amount
            }
          ]
        }
      },
      include: {
        entries: true
      }
    });

    // 2. Cập nhật currentBalance của cả 2 wallet
    // Ví nguồn: giảm balance
    await tx.wallet.update({
      where: { id: fromWalletId },
      data: {
        currentBalance: {
          decrement: amount
        }
      }
    });

    // Ví đích: tăng balance
    await tx.wallet.update({
      where: { id: toWalletId },
      data: {
        currentBalance: {
          increment: amount
        }
      }
    });

    return transaction;
  });
}

export const TransactionService = {
  /**
   * Tạo giao dịch mới
   * Tự động xử lý các loại transaction khác nhau và cập nhật balance
   *
   * @param data - Dữ liệu giao dịch đã validate
   * @param userId - ID của user thực hiện giao dịch
   * @returns Transaction object với entries
   * @throws Error nếu validation fail hoặc có lỗi database
   */
  async createTransaction(data: CreateTransactionData, userId: string) {
    switch (data.type) {
      case 'income':
        return await createIncomeTransaction(data, userId);

      case 'expense':
        return await createExpenseTransaction(data, userId);

      case 'transfer':
        return await createTransferTransaction(data, userId);

      default:
        throw new Error('UNSUPPORTED_TRANSACTION_TYPE');
    }
  },

  /**
   * Lấy danh sách giao dịch của user
   * Có thể filter theo type, date range, category, wallet
   */
  async getTransactions(userId: string, filters?: {
    type?: 'income' | 'expense' | 'transfer';
    startDate?: Date;
    endDate?: Date;
    categoryId?: string;
    walletId?: string;
    limit?: number;
    offset?: number;
    /** Loại trừ giao dịch phát sinh từ trả nợ/thu nợ (LoanPayment) */
    excludeLoanRelated?: boolean;
  }) {
    const {
      type,
      startDate,
      endDate,
      categoryId,
      walletId,
      limit = 50,
      offset = 0,
      excludeLoanRelated = false
    } = filters || {};

    // Build where clause cơ bản (không tính loan filter)
    const baseWhere: any = {
      userId,
      deletedAt: null // Không lấy soft deleted transactions
    };

    if (type) baseWhere.type = type;
    if (startDate || endDate) {
      baseWhere.transactionDate = {};
      if (startDate) baseWhere.transactionDate.gte = startDate;
      if (endDate) baseWhere.transactionDate.lte = endDate;
    }
    if (categoryId) baseWhere.categoryId = categoryId;

    // where cuối cùng (có thể được wrap lại nếu excludeLoanRelated = true)
    let where: any = baseWhere;

    // Loại toàn bộ giao dịch liên quan vay nợ khỏi thống kê thu/chi:
    // - Giao dịch phát sinh từ LoanPayment (trả nợ / thu nợ)  => có loanPayment
    // - Giao dịch gốc khi tạo Loan (giải ngân ban đầu)       => có loanId
    if (excludeLoanRelated) {
      where = {
        AND: [
          baseWhere,
          {
            NOT: {
              OR: [
                { loanPayment: { isNot: null } },
                { loanId: { not: null } }
              ]
            }
          }
        ]
      };
    }

    // Filter theo wallet nếu có
    if (walletId) {
      if (excludeLoanRelated) {
        // Đã wrap bằng AND ở trên -> nối thêm điều kiện entries
        where.AND = [
          ...(where.AND || []),
          {
            entries: {
              some: { walletId }
            }
          }
        ];
      } else {
        where.entries = {
          some: { walletId }
        };
      }
    }

    const transactions = await prisma.transaction.findMany({
      where,
      include: {
        entries: {
          include: {
            wallet: true
          }
        },
        category: true
      },
      orderBy: {
        transactionDate: 'desc'
      },
      take: limit,
      skip: offset
    });

    // Đếm total records
    const total = await prisma.transaction.count({ where });

    return {
      transactions,
      pagination: {
        total,
        limit,
        offset,
        hasMore: offset + limit < total
      }
    };
  }
};
