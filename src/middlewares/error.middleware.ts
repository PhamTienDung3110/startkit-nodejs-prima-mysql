/**
 * Global Error Handler Middleware
 * File này xử lý tất cả errors trong request pipeline
 * Phải được đặt cuối cùng trong app để bắt mọi errors
 */
import { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import { logger } from '../config/logger';

const allowedOrigins = (process.env.CORS_ORIGIN || '')
  .split(',')
  .map((o) => o.trim())
  .filter(Boolean);

/**
 * Gắn CORS headers vào response để browser có thể đọc error response (4xx/5xx).
 * CORS middleware có thể không tự gắn header cho error response trong mọi trường hợp.
 */
function setCorsHeaders(req: Request, res: Response): void {
  const origin = req.get('Origin');
  if (origin && (allowedOrigins.length === 0 || allowedOrigins.includes(origin))) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Access-Control-Allow-Credentials', 'true');
}

/**
 * Error handling middleware
 * Bắt tất cả errors được throw hoặc pass vào next(err)
 * Xử lý và trả về response phù hợp
 *
 * @param err - Error object được throw hoặc pass vào next()
 * @param req - Express Request object (dùng để gắn CORS header cho error response)
 * @param res - Express Response object
 * @param _next - Express NextFunction (không sử dụng)
 */
export const errorMiddleware = (err: unknown, req: Request, res: Response, _next: NextFunction) => {
  setCorsHeaders(req, res);

  // Xử lý Zod validation errors - lỗi validate request body/params
  if (err instanceof ZodError) {
    return res.status(400).json({
      message: 'Validation error',
      errors: err.issues, // Chi tiết các lỗi validation (ZodError có property 'issues')
    });
  }

  // Xử lý các lỗi khác (unexpected errors)
  // Log lỗi để debug (không expose chi tiết cho client vì lý do bảo mật)
  logger.error({ err }, 'Unhandled error');
  return res.status(500).json({ message: 'Internal server error' });
};
