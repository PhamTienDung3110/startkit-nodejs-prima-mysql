import { Response } from 'express';

/**
 * Error Response Configuration
 * - status: HTTP status code
 * - message: Fallback message (English) - FE sẽ dùng code để hiển thị message đã dịch
 */
export interface ErrorResponse {
  status: number;
  message: string;
}

/**
 * Centralized Error Mapping cho tất cả modules
 * Map error code từ service sang HTTP response
 * 
 * NOTE: FE sẽ sử dụng error code để hiển thị message đã được dịch
 * Message ở đây chỉ là fallback cho trường hợp FE không có translation
 */
export const ErrorMap: Record<string, ErrorResponse> = {
  // Authentication Errors
  EMAIL_EXISTS: { status: 409, message: 'Email already exists' },
  INVALID_CREDENTIALS: { status: 401, message: 'Email or password is incorrect' },
  TOKEN_EXPIRED: { status: 401, message: 'Token expired' },
  TOKEN_INVALID: { status: 401, message: 'Invalid token' },
  UNAUTHORIZED: { status: 401, message: 'Unauthorized' },

  // User Errors
  USER_NOT_FOUND: { status: 404, message: 'User not found' },

  // Wallet Errors
  WALLET_NAME_EXISTS: { status: 409, message: 'Wallet name already exists' },
  WALLET_NOT_FOUND: { status: 404, message: 'Wallet not found' },
  WALLET_HAS_TRANSACTIONS: { status: 409, message: 'Cannot archive wallet with existing transactions' },

  // Category Errors
  CATEGORY_NAME_EXISTS: { status: 409, message: 'Category name already exists for this type' },
  PARENT_CATEGORY_NOT_FOUND: { status: 404, message: 'Parent category not found' },
  INVALID_PARENT_TYPE: { status: 400, message: 'Parent category must be the same type' },
  CIRCULAR_REFERENCE: { status: 400, message: 'Circular reference detected' },
  CATEGORY_NOT_FOUND: { status: 404, message: 'Category not found' },
  CATEGORY_HAS_TRANSACTIONS: { status: 409, message: 'Cannot delete category with existing transactions' },
  CATEGORY_HAS_CHILDREN: { status: 409, message: 'Cannot delete category with child categories' },
  CATEGORY_TEMPLATE_NOT_FOUND: { status: 404, message: 'Category template not found' },

  // Transaction Errors
  TRANSACTION_WALLET_NOT_FOUND: { status: 404, message: 'Wallet not found or does not belong to user' },
  TRANSACTION_CATEGORY_NOT_FOUND: { status: 404, message: 'Category not found or does not belong to user' },
  INVALID_CATEGORY_TYPE_FOR_INCOME: { status: 400, message: 'Category type must be income for income transactions' },
  INVALID_CATEGORY_TYPE_FOR_EXPENSE: { status: 400, message: 'Category type must be expense for expense transactions' },
  UNSUPPORTED_TRANSACTION_TYPE: { status: 400, message: 'Unsupported transaction type' },
  SAME_WALLET_TRANSFER: { status: 400, message: 'Source and destination wallets must be different' },
  INSUFFICIENT_WALLET_BALANCE: { status: 400, message: 'Insufficient wallet balance' },
  INSUFFICIENT_BALANCE: { status: 400, message: 'Insufficient balance' },
  TRANSACTION_NOT_FOUND: { status: 404, message: 'Transaction not found' },
  TRANSACTION_TYPE_IMMUTABLE: { status: 400, message: 'Transaction type cannot be changed' },
  TRANSACTION_LOCKED_BY_LOAN: { status: 400, message: 'Transaction linked to loan cannot be modified' },
  TRANSACTION_INVALID_ENTRIES: { status: 409, message: 'Transaction entries are invalid' },

  // Transaction Template Errors
  TEMPLATE_NAME_EXISTS: { status: 409, message: 'Template name already exists' },
  TEMPLATE_NOT_FOUND: { status: 404, message: 'Transaction template not found' },
  TEMPLATE_WALLET_NOT_FOUND: { status: 404, message: 'Wallet not found or does not belong to user' },
  TEMPLATE_CATEGORY_NOT_FOUND: { status: 404, message: 'Category not found or does not belong to user' },
  TEMPLATE_CATEGORY_TYPE_MISMATCH: { status: 400, message: 'Category type does not match transaction type' },
  PRISMA_TEMPLATE_MODEL_MISSING: { status: 503, message: 'Prisma client missing TransactionTemplate. Run: npx prisma generate in LE-backend folder' },

  // Loan Errors
  LOAN_NOT_FOUND: { status: 404, message: 'Loan not found' },
  LOAN_WALLET_NOT_FOUND: { status: 404, message: 'Wallet not found or does not belong to user' },
  LOAN_ALREADY_SETTLED: { status: 400, message: 'Loan is already settled' },
  LOAN_PAYMENT_EXCEEDS_REMAINING: { status: 400, message: 'Payment amount exceeds remaining balance' },

  // Goal Errors
  GOAL_NOT_FOUND: { status: 404, message: 'Goal not found' },
  GOAL_HAS_SUB_GOALS: { status: 409, message: 'Cannot delete goal with existing sub-goals' },
  INVALID_PARENT_GOAL_TYPE: { status: 400, message: 'Parent goal must be yearly and current goal must be monthly' },
  MILESTONE_NOT_FOUND: { status: 404, message: 'Milestone not found' },

  // Validation Errors
  VALIDATION_ERROR: { status: 400, message: 'Validation error' },
  INVALID_INPUT: { status: 400, message: 'Invalid input' },

  // Database Errors
  DATABASE_ERROR: { status: 500, message: 'Database error' },
  CONNECTION_ERROR: { status: 500, message: 'Connection error' },
  P2021: { status: 503, message: 'Table does not exist. Run: npx prisma migrate deploy in LE-backend' },

  // Dictionary Errors
  WORD_NOT_FOUND: { status: 404, message: 'Word not found in Oxford dictionary' },
  DICTIONARY_LOOKUP_FAILED: { status: 502, message: 'Failed to fetch dictionary data from Oxford' },

  // Generic Errors
  INTERNAL_SERVER_ERROR: { status: 500, message: 'Internal server error' }
};

/**
 * Generic error handler cho tất cả controllers
 * @param error - Error object từ service
 * @param res - Express response object
 * @param context - Optional context để logging (tên module/method)
 * @returns Response đã được gửi
 * 
 * Response format:
 * - code: Error code để FE dịch message (ví dụ: "INSUFFICIENT_BALANCE")
 * - message: Fallback message tiếng Anh
 */
export function handleError(error: any, res: Response, context?: string): Response {
  // Prisma errors: error.code (e.g. P2021), service errors: error.message (e.g. TEMPLATE_NOT_FOUND)
  const errorCode = error?.code ?? error.message;
  const errorConfig = ErrorMap[errorCode];

  if (errorConfig) {
    return res.status(errorConfig.status).json({
      code: errorCode,
      message: errorConfig.message
    });
  }

  // Unknown error - log và return generic 500
  const errorContext = context ? `[${context}] ` : '';
  console.error(`${errorContext}Unhandled error:`, {
    message: error.message,
    stack: error.stack,
    code: error.code
  });

  const body: Record<string, string> = {
    code: 'INTERNAL_SERVER_ERROR',
    message: 'Internal server error'
  };
  // Dev: trả thêm chi tiết lỗi để debug (không dùng ở production)
  if (process.env.NODE_ENV !== 'production' && error?.message) {
    body.detail = String(error.message);
    if (error?.stack) body.stack = String(error.stack);
  }

  return res.status(500).json(body);
}

/**
 * Create error handler cho specific module
 * @param moduleName - Tên module để logging context
 * @returns Error handler function cho module đó
 */
export function createModuleErrorHandler(moduleName: string) {
  return (error: any, res: Response) => handleError(error, res, moduleName);
}

/**
 * Validation error handler cho Zod/validation errors
 * @param error - ZodError object
 * @param res - Express response object
 * @returns Response đã được gửi
 */
export function handleValidationError(error: any, res: Response): Response {
  if (error.name === 'ZodError') {
    // Zod validation error
    const errors = error.errors.map((err: any) => ({
      field: err.path.join('.'),
      message: err.message,
      code: err.code
    }));

    return res.status(400).json({
      message: 'Validation error',
      errors
    });
  }

  // Fallback to generic error handler
  return handleError(error, res, 'Validation');
}

/**
 * Database error handler
 * @param error - Database error
 * @param res - Express response object
 * @param operation - Database operation context
 * @returns Response đã được gửi
 */
export function handleDatabaseError(error: any, res: Response, operation?: string): Response {
  console.error(`Database error${operation ? ` (${operation})` : ''}:`, {
    message: error.message,
    code: error.code,
    errno: error.errno,
    sqlState: error.sqlState
  });

  // Check for specific database errors
  if (error.code === 'ER_DUP_ENTRY') {
    return res.status(409).json({ message: 'Duplicate entry' });
  }

  if (error.code === 'ER_NO_REFERENCED_ROW') {
    return res.status(404).json({ message: 'Referenced record not found' });
  }

  if (error.code === 'ER_ROW_IS_REFERENCED') {
    return res.status(409).json({ message: 'Cannot delete record with existing references' });
  }

  // Generic database error
  return res.status(500).json({ message: 'Database operation failed' });
}

/**
 * Async route wrapper để tự động handle errors trong async routes
 * @param fn - Async route handler function
 * @returns Wrapped route handler với error handling
 */
export function asyncHandler(fn: Function) {
  return (req: any, res: any, next: any) => {
    Promise.resolve(fn(req, res, next)).catch((error) => {
      handleError(error, res, fn.name);
    });
  };
}
