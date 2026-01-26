import { Response } from 'express';

/**
 * Error Response Configuration
 */
export interface ErrorResponse {
  status: number;
  message: string;
}

/**
 * Centralized Error Mapping cho tất cả modules
 * Map error message từ service sang HTTP response
 */
export const ErrorMap: Record<string, ErrorResponse> = {
  // Authentication Errors
  EMAIL_EXISTS: { status: 409, message: 'Email already exists' },
  INVALID_CREDENTIALS: { 
    status: 401, 
    message: 'Email or password is incorrect' 
  },
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
  TEMPLATE_NOT_FOUND: { status: 404, message: 'Category template not found' },

  // Transaction Errors
  TRANSACTION_WALLET_NOT_FOUND: { status: 404, message: 'Wallet not found or does not belong to user' },
  TRANSACTION_CATEGORY_NOT_FOUND: { status: 404, message: 'Category not found or does not belong to user' },
  INVALID_CATEGORY_TYPE_FOR_INCOME: { status: 400, message: 'Category type must be income for income transactions' },
  INVALID_CATEGORY_TYPE_FOR_EXPENSE: { status: 400, message: 'Category type must be expense for expense transactions' },
  UNSUPPORTED_TRANSACTION_TYPE: { status: 400, message: 'Unsupported transaction type' },
  SAME_WALLET_TRANSFER: { status: 400, message: 'Ví nguồn và ví đích phải khác nhau' },
  INSUFFICIENT_BALANCE: { status: 400, message: 'Insufficient balance' },

  // Validation Errors
  VALIDATION_ERROR: { status: 400, message: 'Validation error' },
  INVALID_INPUT: { status: 400, message: 'Invalid input' },

  // Database Errors
  DATABASE_ERROR: { status: 500, message: 'Database error' },
  CONNECTION_ERROR: { status: 500, message: 'Connection error' }
};

/**
 * Generic error handler cho tất cả controllers
 * @param error - Error object từ service
 * @param res - Express response object
 * @param context - Optional context để logging (tên module/method)
 * @returns Response đã được gửi
 */
export function handleError(error: any, res: Response, context?: string): Response {
  const errorConfig = ErrorMap[error.message];

  if (errorConfig) {
    // Known error - return configured response
    return res.status(errorConfig.status).json({ message: errorConfig.message });
  }

  // Unknown error - log và return generic 500
  const errorContext = context ? `[${context}] ` : '';
  console.error(`${errorContext}Unhandled error:`, {
    message: error.message,
    stack: error.stack,
    code: error.code
  });

  return res.status(500).json({ message: 'Internal server error' });
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
