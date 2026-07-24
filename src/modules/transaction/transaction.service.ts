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
import { CreateTransactionData, UpdateTransactionData } from './transaction.schema';

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
async function createExpenseTransaction(data: CreateTransactionData & { type: 'expense' }, userId: string, skipBalanceCheck = false) {
  const { walletId, categoryId, transactionDate, amount, note } = data;

  // Validate wallet và kiểm tra số dư (bỏ qua kiểm tra số dư nếu skipBalanceCheck = true)
  await validateWalletOwnership(walletId, userId, skipBalanceCheck ? undefined : amount);
  await validateCategoryOwnership(categoryId!, userId, 'expense');

  // Tạo transaction và entry trong DB transaction
  return await prisma.$transaction(async (tx) => {
    if (!skipBalanceCheck) {
      // Kiểm tra lại số dư trong transaction để tránh race condition
      const wallet = await tx.wallet.findUnique({
        where: { id: walletId },
        select: { currentBalance: true }
      });

      if (!wallet || wallet.currentBalance.toNumber() < amount) {
        throw new Error('INSUFFICIENT_WALLET_BALANCE');
      }
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

async function getMutableTransaction(transactionId: string, userId: string) {
  const transaction = await prisma.transaction.findFirst({
    where: {
      id: transactionId,
      userId,
      deletedAt: null
    },
    include: {
      entries: true,
      loanPayment: {
        select: { id: true }
      }
    }
  });

  if (!transaction) {
    throw new Error('TRANSACTION_NOT_FOUND');
  }

  // Không cho sửa/xóa giao dịch gắn với nghiệp vụ vay nợ.
  if (transaction.loanId || transaction.loanPayment) {
    throw new Error('TRANSACTION_LOCKED_BY_LOAN');
  }

  return transaction;
}

async function reverseTransactionImpact(
  tx: Parameters<Parameters<typeof prisma.$transaction>[0]>[0],
  transaction: Awaited<ReturnType<typeof getMutableTransaction>>
) {
  if (transaction.type === 'income') {
    const inEntry = transaction.entries.find((e) => e.direction === 'in');
    if (!inEntry) throw new Error('TRANSACTION_INVALID_ENTRIES');
    await tx.wallet.update({
      where: { id: inEntry.walletId },
      data: {
        currentBalance: {
          decrement: transaction.amount
        }
      }
    });
    return;
  }

  if (transaction.type === 'expense') {
    const outEntry = transaction.entries.find((e) => e.direction === 'out');
    if (!outEntry) throw new Error('TRANSACTION_INVALID_ENTRIES');
    await tx.wallet.update({
      where: { id: outEntry.walletId },
      data: {
        currentBalance: {
          increment: transaction.amount
        }
      }
    });
    return;
  }

  // transfer
  const outEntry = transaction.entries.find((e) => e.direction === 'out');
  const inEntry = transaction.entries.find((e) => e.direction === 'in');
  if (!outEntry || !inEntry) throw new Error('TRANSACTION_INVALID_ENTRIES');

  await tx.wallet.update({
    where: { id: outEntry.walletId },
    data: {
      currentBalance: {
        increment: transaction.amount
      }
    }
  });

  await tx.wallet.update({
    where: { id: inEntry.walletId },
    data: {
      currentBalance: {
        decrement: transaction.amount
      }
    }
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
  async createTransaction(data: CreateTransactionData, userId: string, skipBalanceCheck = false) {
    switch (data.type) {
      case 'income':
        return await createIncomeTransaction(data, userId);

      case 'expense':
        return await createExpenseTransaction(data, userId, skipBalanceCheck);

      case 'transfer':
        return await createTransferTransaction(data, userId);

      default:
        throw new Error('UNSUPPORTED_TRANSACTION_TYPE');
    }
  },

  /**
   * Cập nhật giao dịch hiện có.
   * Nghiệp vụ:
   * 1) Hoàn tác ảnh hưởng giao dịch cũ lên balance
   * 2) Áp dụng dữ liệu mới
   */
  async updateTransaction(transactionId: string, data: UpdateTransactionData, userId: string) {
    const existingTransaction = await getMutableTransaction(transactionId, userId);

    // Tránh đổi type trong edit để nghiệp vụ rõ ràng và an toàn.
    if (existingTransaction.type !== data.type) {
      throw new Error('TRANSACTION_TYPE_IMMUTABLE');
    }

    if (data.type === 'income') {
      await validateWalletOwnership(data.walletId, userId);
      await validateCategoryOwnership(data.categoryId, userId, 'income');
    } else if (data.type === 'expense') {
      await validateWalletOwnership(data.walletId, userId);
      await validateCategoryOwnership(data.categoryId, userId, 'expense');
    } else {
      if (data.fromWalletId === data.toWalletId) {
        throw new Error('SAME_WALLET_TRANSFER');
      }
      await validateWalletOwnership(data.fromWalletId, userId);
      await validateWalletOwnership(data.toWalletId, userId);
    }

    return await prisma.$transaction(async (tx) => {
      await reverseTransactionImpact(tx, existingTransaction);

      if (data.type === 'expense') {
        const wallet = await tx.wallet.findUnique({
          where: { id: data.walletId },
          select: { currentBalance: true }
        });
        if (!wallet || wallet.currentBalance.toNumber() < data.amount) {
          throw new Error('INSUFFICIENT_WALLET_BALANCE');
        }
      }

      if (data.type === 'transfer') {
        const fromWallet = await tx.wallet.findUnique({
          where: { id: data.fromWalletId },
          select: { currentBalance: true }
        });
        if (!fromWallet || fromWallet.currentBalance.toNumber() < data.amount) {
          throw new Error('INSUFFICIENT_WALLET_BALANCE');
        }
      }

      await tx.transactionEntry.deleteMany({
        where: { transactionId }
      });

      if (data.type === 'income') {
        await tx.transaction.update({
          where: { id: transactionId },
          data: {
            transactionDate: data.transactionDate,
            categoryId: data.categoryId,
            amount: data.amount,
            note: data.note
          }
        });
        await tx.transactionEntry.create({
          data: {
            transactionId,
            walletId: data.walletId,
            direction: 'in',
            amount: data.amount
          }
        });
        await tx.wallet.update({
          where: { id: data.walletId },
          data: {
            currentBalance: {
              increment: data.amount
            }
          }
        });
      } else if (data.type === 'expense') {
        await tx.transaction.update({
          where: { id: transactionId },
          data: {
            transactionDate: data.transactionDate,
            categoryId: data.categoryId,
            amount: data.amount,
            note: data.note
          }
        });
        await tx.transactionEntry.create({
          data: {
            transactionId,
            walletId: data.walletId,
            direction: 'out',
            amount: data.amount
          }
        });
        await tx.wallet.update({
          where: { id: data.walletId },
          data: {
            currentBalance: {
              decrement: data.amount
            }
          }
        });
      } else {
        await tx.transaction.update({
          where: { id: transactionId },
          data: {
            transactionDate: data.transactionDate,
            categoryId: null,
            amount: data.amount,
            note: data.note
          }
        });
        await tx.transactionEntry.createMany({
          data: [
            {
              transactionId,
              walletId: data.fromWalletId,
              direction: 'out',
              amount: data.amount
            },
            {
              transactionId,
              walletId: data.toWalletId,
              direction: 'in',
              amount: data.amount
            }
          ]
        });
        await tx.wallet.update({
          where: { id: data.fromWalletId },
          data: {
            currentBalance: {
              decrement: data.amount
            }
          }
        });
        await tx.wallet.update({
          where: { id: data.toWalletId },
          data: {
            currentBalance: {
              increment: data.amount
            }
          }
        });
      }

      const updatedTransaction = await tx.transaction.findUnique({
        where: { id: transactionId },
        include: {
          entries: {
            include: {
              wallet: true
            }
          },
          category: true
        }
      });

      if (!updatedTransaction) {
        throw new Error('TRANSACTION_NOT_FOUND');
      }

      return updatedTransaction;
    });
  },

  /**
   * Xóa mềm giao dịch và hoàn tác ảnh hưởng số dư.
   */
  async deleteTransaction(transactionId: string, userId: string) {
    const existingTransaction = await getMutableTransaction(transactionId, userId);

    return await prisma.$transaction(async (tx) => {
      await reverseTransactionImpact(tx, existingTransaction);

      const deletedTransaction = await tx.transaction.update({
        where: { id: transactionId },
        data: {
          deletedAt: new Date()
        },
        include: {
          entries: true,
          category: true
        }
      });

      return deletedTransaction;
    });
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
      take: limit === -1 ? undefined : limit,
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
        hasMore: limit === -1 ? false : offset + limit < total
      }
    };
  }
};
