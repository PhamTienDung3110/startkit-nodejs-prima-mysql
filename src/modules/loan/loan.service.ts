/**
 * Loan Service
 * File này chứa business logic cho việc quản lý khoản nợ/cho vay
 * Service layer - xử lý logic nghiệp vụ, không liên quan đến HTTP
 *
 * Logic nghiệp vụ quan trọng:
 * - Loan: quản lý khoản nợ (bạn nợ người khác) hoặc cho vay (người khác nợ bạn)
 * - LoanPayment: mỗi lần trả/thu nợ phải tạo Transaction tương ứng và cập nhật wallet balance
 * - Khi outstandingAmount = 0 thì tự động đổi status thành 'closed'
 */
import { prisma } from '../../db/prisma';
import { CreateLoanData, UpdateLoanData, CreateLoanPaymentData, GetLoansQuery, GetLoanPaymentsQuery } from './loan.schema';

/**
 * Validate wallet ownership
 */
async function validateWalletOwnership(walletId: string, userId: string, requiredAmount?: number) {
  const wallet = await prisma.wallet.findFirst({
    where: { id: walletId, userId, isArchived: false }
  });
  if (!wallet) {
    throw new Error('WALLET_NOT_FOUND');
  }

  // Kiểm tra số dư nếu cần trừ tiền (khi trả nợ - you_owe)
  if (requiredAmount !== undefined && wallet.currentBalance.toNumber() < requiredAmount) {
    throw new Error('INSUFFICIENT_WALLET_BALANCE');
  }

  return wallet;
}

/**
 * Validate loan ownership và kiểm tra trạng thái
 */
async function validateLoanOwnership(loanId: string, userId: string) {
  const loan = await prisma.loan.findFirst({
    where: { id: loanId, userId, deletedAt: null }
  });
  if (!loan) {
    throw new Error('LOAN_NOT_FOUND');
  }
  if (loan.status === 'closed') {
    throw new Error('LOAN_ALREADY_CLOSED');
  }
  return loan;
}

export const LoanService = {
  /**
   * Tạo khoản nợ/cho vay mới
   * Logic nghiệp vụ:
   * - you_owe: tạo income transaction (nhận tiền vào ví)
   * - owed_to_you: tạo expense transaction (trừ tiền từ ví)
   *
   * @param data - Dữ liệu khoản nợ mới
   * @param userId - ID của user tạo khoản nợ
   * @returns Loan object đã tạo
   */
  async createLoan(data: CreateLoanData, userId: string) {
    const { kind, counterpartyName, principal, walletId, startDate, dueDate, note } = data;

    // Validate wallet ownership
    await validateWalletOwnership(walletId, userId);

    // Nếu là cho vay (owed_to_you), kiểm tra số dư ví
    if (kind === 'owed_to_you') {
      await validateWalletOwnership(walletId, userId, principal);
    }

    // Tạo loan và transaction trong DB transaction
    return await prisma.$transaction(async (tx) => {
      // 1. Tạo Loan
      const loan = await tx.loan.create({
        data: {
          userId,
          kind,
          counterpartyName,
          principal,
          outstandingAmount: principal, // Ban đầu dư nợ = số tiền gốc
          startDate: new Date(startDate),
          dueDate: dueDate ? new Date(dueDate) : null,
          note,
          status: 'open'
        }
      });

      // 2. Tạo Transaction tương ứng (giao dịch gốc của Loan)
      const transactionType = kind === 'you_owe' ? 'income' : 'expense';
      const entryDirection = kind === 'you_owe' ? 'in' : 'out';

      // Tìm category mặc định cho loan
      let categoryId: string | null = null;
      const defaultCategory = await tx.category.findFirst({
        where: {
          userId,
          type: transactionType,
          name: kind === 'you_owe' ? 'Vay nợ' : 'Cho vay',
          isSystem: true
        }
      });
      if (defaultCategory) {
        categoryId = defaultCategory.id;
      }

      const transaction = await tx.transaction.create({
        data: {
          userId,
          type: transactionType,
          transactionDate: new Date(startDate),
          categoryId,
          amount: principal,
          note: note || `${kind === 'you_owe' ? 'Vay nợ' : 'Cho vay'}: ${counterpartyName}`,
          loanId: loan.id, // ✅ đánh dấu giao dịch gốc của khoản vay
          entries: {
            create: {
              walletId,
              direction: entryDirection,
              amount: principal
            }
          }
        }
      });

      // 3. Cập nhật wallet balance
      if (kind === 'you_owe') {
        // Vay nợ: cộng tiền vào ví
        await tx.wallet.update({
          where: { id: walletId },
          data: {
            currentBalance: {
              increment: principal
            }
          }
        });
      } else {
        // Cho vay: trừ tiền từ ví
        await tx.wallet.update({
          where: { id: walletId },
          data: {
            currentBalance: {
              decrement: principal
            }
          }
        });
      }

      // Có thể return kèm transaction nếu FE cần sau này
      return loan;
    });
  },

  /**
   * Lấy danh sách khoản nợ/cho vay của user
   *
   * @param userId - ID của user
   * @param filters - Các filter tùy chọn
   * @returns Danh sách khoản nợ với pagination
   */
  async getLoans(userId: string, filters: Partial<GetLoansQuery> = {}) {
    const { kind, status, startDate, endDate } = filters;
    const limit = Math.min(100, Math.max(1, Number(filters.limit) || 50));
    const offset = Math.max(0, Number(filters.offset) || 0);

    // Build where clause
    const where: any = {
      userId,
      deletedAt: null
    };

    if (kind) where.kind = kind;
    if (status) where.status = status;
    if (startDate || endDate) {
      where.startDate = {};
      if (startDate) {
        const d = new Date(startDate);
        if (!isNaN(d.getTime())) where.startDate.gte = d;
      }
      if (endDate) {
        const d = new Date(endDate);
        if (!isNaN(d.getTime())) where.startDate.lte = d;
      }
    }

    // Lấy danh sách khoản nợ
    const loans = await prisma.loan.findMany({
      where,
      include: {
        payments: {
          orderBy: { paymentDate: 'desc' },
          take: 3 // Lấy 3 lần trả gần nhất
        }
      },
      orderBy: [
        { status: 'asc' }, // Open loans trước
        { dueDate: 'asc' }, // Sắp hết hạn trước
        { createdAt: 'desc' }
      ],
      take: limit,
      skip: offset
    });

    // Đếm total
    const total = await prisma.loan.count({ where });

    return {
      loans,
      pagination: {
        total,
        limit,
        offset,
        hasMore: offset + limit < total
      }
    };
  },

  /**
   * Lấy khoản nợ theo ID
   *
   * @param loanId - ID của khoản nợ
   * @param userId - ID của user (để verify ownership)
   * @returns Loan object với payments hoặc null nếu không tìm thấy
   */
  async getLoanById(loanId: string, userId: string) {
    return await prisma.loan.findFirst({
      where: {
        id: loanId,
        userId,
        deletedAt: null
      },
      include: {
        payments: {
          include: {
            wallet: true,
            transaction: true
          },
          orderBy: { paymentDate: 'desc' }
        }
      }
    });
  },

  /**
   * Cập nhật khoản nợ
   *
   * @param loanId - ID của khoản nợ cần cập nhật
   * @param userId - ID của user sở hữu khoản nợ
   * @param data - Dữ liệu cập nhật
   * @returns Loan object đã cập nhật
   * @throws Error('LOAN_NOT_FOUND') nếu khoản nợ không tồn tại
   */
  async updateLoan(loanId: string, userId: string, data: UpdateLoanData) {
    // Kiểm tra khoản nợ tồn tại và thuộc user
    const existingLoan = await prisma.loan.findFirst({
      where: { id: loanId, userId, deletedAt: null }
    });

    if (!existingLoan) {
      throw new Error('LOAN_NOT_FOUND');
    }

    // Cập nhật khoản nợ
    const updatedLoan = await prisma.loan.update({
      where: { id: loanId },
      data: {
        ...data,
        dueDate: data.dueDate ? new Date(data.dueDate) : undefined
      }
    });

    return updatedLoan;
  },

  /**
   * Xóa khoản nợ (soft delete)
   *
   * @param loanId - ID của khoản nợ cần xóa
   * @param userId - ID của user sở hữu khoản nợ
   * @returns Loan object đã xóa
   * @throws Error('LOAN_NOT_FOUND') nếu khoản nợ không tồn tại
   * @throws Error('LOAN_HAS_PAYMENTS') nếu khoản nợ đã có thanh toán
   */
  async deleteLoan(loanId: string, userId: string) {
    // Xóa khoản nợ cần đảm bảo hoàn lại tiền gốc vào ví
    // Chỉ cho phép xóa nếu khoản nợ chưa có thanh toán nào
    const deletedLoan = await prisma.$transaction(async (tx) => {
      // 1. Lấy loan + kiểm tra payments
      const loan = await tx.loan.findFirst({
        where: { id: loanId, userId, deletedAt: null },
        include: {
          payments: {
            select: { id: true },
            take: 1
          }
        }
      });

      if (!loan) {
        throw new Error('LOAN_NOT_FOUND');
      }

      if (loan.payments.length > 0) {
        // Khoản nợ đã có thanh toán (thu nợ / trả nợ) thì không tự hoàn tiền khi xóa
        // Giữ behaviour cũ: không cho xóa để tránh sai lệch sổ
        throw new Error('LOAN_HAS_PAYMENTS');
      }

      // 2. Tìm Transaction gốc đã được tạo khi tạo loan để hoàn tiền
      //    Giờ đã link trực tiếp Loan <-> Transaction qua loanId
      const baseTransaction = await tx.transaction.findFirst({
        where: {
          userId,
          deletedAt: null,
          loanId: loan.id
        },
        include: {
          entries: true
        }
      });

      if (baseTransaction && baseTransaction.entries.length === 1) {
        const entry = baseTransaction.entries[0];

        // 3. Hoàn tiền lại ví theo loại khoản nợ
        // - you_owe: lúc tạo loan đã cộng tiền vào ví -> giờ phải trừ lại
        // - owed_to_you: lúc tạo loan đã trừ tiền khỏi ví -> giờ phải cộng lại
        await tx.wallet.update({
          where: { id: entry.walletId },
          data: {
            currentBalance: {
              [loan.kind === 'you_owe' ? 'decrement' : 'increment']:
                loan.principal
            } as any
          }
        });

        // 4. Soft delete transaction gốc để không còn hiển thị trong lịch sử
        await tx.transaction.update({
          where: { id: baseTransaction.id },
          data: { deletedAt: new Date() }
        });
      }

      // 5. Soft delete loan
      const deleted = await tx.loan.update({
        where: { id: loanId },
        data: { deletedAt: new Date() }
      });

      return deleted;
    });

    return deletedLoan;
  },

  /**
   * Tạo thanh toán khoản nợ
   * Logic nghiệp vụ:
   * - you_owe: tạo expense transaction (trừ tiền từ wallet)
   * - owed_to_you: tạo income transaction (cộng tiền vào wallet)
   * - Cập nhật outstandingAmount của loan
   * - Nếu outstandingAmount = 0 thì đổi status thành 'closed'
   *
   * @param data - Dữ liệu thanh toán
   * @param userId - ID của user thực hiện thanh toán
   * @returns LoanPayment object đã tạo
   */
  async createLoanPayment(data: CreateLoanPaymentData, userId: string) {
    const { loanId, walletId, paymentDate, amount, note } = data;

    // Validate loan và wallet
    const loan = await validateLoanOwnership(loanId, userId);
    
    // Kiểm tra số tiền thanh toán không vượt quá dư nợ
    if (amount > loan.outstandingAmount.toNumber()) {
      throw new Error('PAYMENT_EXCEEDS_OUTSTANDING');
    }

    // Validate wallet và kiểm tra số dư nếu cần (you_owe case)
    const requiredAmount = loan.kind === 'you_owe' ? amount : undefined;
    await validateWalletOwnership(walletId, userId, requiredAmount);

    // Tạo payment và transaction trong DB transaction
    return await prisma.$transaction(async (tx) => {
      // 1. Tạo Transaction tương ứng
      const transactionType = loan.kind === 'you_owe' ? 'expense' : 'income';
      const entryDirection = loan.kind === 'you_owe' ? 'out' : 'in';

      // Tìm category mặc định cho loan payments
      let categoryId: string | null = null;
      const defaultCategory = await tx.category.findFirst({
        where: {
          userId,
          type: transactionType,
          name: loan.kind === 'you_owe' ? 'Trả nợ' : 'Thu nợ',
          isSystem: true
        }
      });
      if (defaultCategory) {
        categoryId = defaultCategory.id;
      }

      const transaction = await tx.transaction.create({
        data: {
          userId,
          type: transactionType,
          transactionDate: new Date(paymentDate),
          categoryId,
          amount,
          note: note || `${loan.kind === 'you_owe' ? 'Trả nợ' : 'Thu nợ'}: ${loan.counterpartyName}`,
          entries: {
            create: {
              walletId,
              direction: entryDirection,
              amount
            }
          }
        }
      });

      // 2. Tạo LoanPayment
      const loanPayment = await tx.loanPayment.create({
        data: {
          loanId,
          userId,
          walletId,
          transactionId: transaction.id,
          paymentDate: new Date(paymentDate),
          amount,
          note
        },
        include: {
          loan: true,
          wallet: true,
          transaction: true
        }
      });

      // 3. Cập nhật wallet balance
      if (loan.kind === 'you_owe') {
        // Trả nợ: trừ tiền từ wallet
        await tx.wallet.update({
          where: { id: walletId },
          data: {
            currentBalance: {
              decrement: amount
            }
          }
        });
      } else {
        // Thu nợ: cộng tiền vào wallet
        await tx.wallet.update({
          where: { id: walletId },
          data: {
            currentBalance: {
              increment: amount
            }
          }
        });
      }

      // 4. Cập nhật outstandingAmount của loan
      const newOutstandingAmount = loan.outstandingAmount.toNumber() - amount;
      const newStatus = newOutstandingAmount <= 0 ? 'closed' : 'open';

      await tx.loan.update({
        where: { id: loanId },
        data: {
          outstandingAmount: Math.max(0, newOutstandingAmount),
          status: newStatus
        }
      });

      return loanPayment;
    });
  },

  /**
   * Lấy danh sách thanh toán khoản nợ
   *
   * @param userId - ID của user
   * @param filters - Các filter tùy chọn
   * @returns Danh sách thanh toán với pagination
   */
  async getLoanPayments(userId: string, filters: Partial<GetLoanPaymentsQuery> = {}) {
    const { loanId, limit = 50, offset = 0 } = filters;

    // Build where clause
    const where: any = { userId };
    if (loanId) where.loanId = loanId;

    const payments = await prisma.loanPayment.findMany({
      where,
      include: {
        loan: true,
        wallet: true,
        transaction: true
      },
      orderBy: { paymentDate: 'desc' },
      take: limit,
      skip: offset
    });

    const total = await prisma.loanPayment.count({ where });

    return {
      payments,
      pagination: {
        total,
        limit,
        offset,
        hasMore: offset + limit < total
      }
    };
  },

  /**
   * Lấy thống kê tổng quan về khoản nợ của user
   *
   * @param userId - ID của user
   * @returns Thống kê tổng quan
   */
  async getLoanStats(userId: string) {
    // Thống kê theo kind và status
    const loanStats = await prisma.loan.groupBy({
      by: ['kind', 'status'],
      where: {
        userId,
        deletedAt: null
      },
      _count: {
        id: true
      },
      _sum: {
        outstandingAmount: true
      }
    });

    // Tính tổng dư nợ theo loại
    const youOweTotal = loanStats
      .filter(stat => stat.kind === 'you_owe' && stat.status === 'open')
      .reduce((sum, stat) => sum + (stat._sum.outstandingAmount?.toNumber() || 0), 0);

    const owedToYouTotal = loanStats
      .filter(stat => stat.kind === 'owed_to_you' && stat.status === 'open')
      .reduce((sum, stat) => sum + (stat._sum.outstandingAmount?.toNumber() || 0), 0);

    return {
      youOwe: {
        count: loanStats.filter(s => s.kind === 'you_owe' && s.status === 'open').reduce((sum, s) => sum + s._count.id, 0),
        totalAmount: youOweTotal
      },
      owedToYou: {
        count: loanStats.filter(s => s.kind === 'owed_to_you' && s.status === 'open').reduce((sum, s) => sum + s._count.id, 0),
        totalAmount: owedToYouTotal
      },
      totalLoans: loanStats.reduce((sum, stat) => sum + stat._count.id, 0)
    };
  }
};