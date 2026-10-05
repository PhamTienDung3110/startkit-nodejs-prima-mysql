/**
 * Authentication & Authorization Middlewares
 * File này chứa các middleware để xác thực và phân quyền người dùng
 */
import { Request, Response, NextFunction } from 'express';
import { verifyAccessToken } from '../utils/jwt';

/**
 * Middleware yêu cầu authentication
 * Kiểm tra và verify JWT access token từ Authorization header
 * Nếu hợp lệ, attach user info vào req.user và cho phép tiếp tục
 * Nếu không hợp lệ, trả về 401 Unauthorized
 */
export const requireAuth = (req: Request, res: Response, next: NextFunction) => {
  // Lấy Authorization header từ request
  const header = req.headers.authorization;
  // Kiểm tra format: phải bắt đầu với "Bearer "
  if (!header?.startsWith('Bearer ')) return res.status(401).json({ message: 'Missing Bearer token' });

  // Extract token từ header (bỏ phần "Bearer ")
  const token = header.slice('Bearer '.length);
  try {
    // Verify token và lấy payload (chứa user id và role)
    // Attach vào req.user để các middleware/controller sau có thể sử dụng
    req.user = verifyAccessToken(token);
    next(); // Cho phép tiếp tục request
  } catch {
    // Token không hợp lệ hoặc đã hết hạn
    return res.status(401).json({ message: 'Invalid or expired token' });
  }
};

/**
 * Middleware xác thực tùy chọn (optional)
 * Nếu có token hợp lệ -> gắn req.user
 * Nếu không có token -> vẫn cho phép tiếp tục (dùng default_user)
 */
export const optionalAuth = (req: Request, res: Response, next: NextFunction) => {
  const header = req.headers.authorization;
  if (header?.startsWith('Bearer ')) {
    const token = header.slice('Bearer '.length);
    try {
      req.user = verifyAccessToken(token);
    } catch {
      // bỏ qua lỗi token để không block request
    }
  }
  next();
};

/**
 * Middleware yêu cầu role cụ thể (authorization)
 * Phải được sử dụng sau requireAuth để đảm bảo req.user đã được set
 * Kiểm tra xem user có role phù hợp không
 * 
 * @param roles - Mảng các role được phép truy cập endpoint này
 * @returns Middleware function
 */
export const requireRole =
  (roles: Array<'USER' | 'ADMIN'>) => (req: Request, res: Response, next: NextFunction) => {
    // Kiểm tra user đã được authenticate chưa
    if (!req.user) return res.status(401).json({ message: 'Unauthenticated' });
    // Kiểm tra user có role trong danh sách được phép không
    if (!roles.includes(req.user.role)) return res.status(403).json({ message: 'Forbidden' });
    next(); // User có quyền, cho phép tiếp tục
  };
