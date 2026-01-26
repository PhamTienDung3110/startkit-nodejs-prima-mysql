/**
 * Authentication Controller
 * File này xử lý HTTP requests/responses cho các authentication endpoints
 * Controller layer - chỉ xử lý HTTP, business logic nằm ở Service layer
 */
import { Request, Response } from 'express';
import { AuthService } from './auth.service';
import { handleError } from '../../utils/error-handler';

// Create module-specific error handler
const handleAuthError = (error: any, res: Response) =>
  handleError(error, res, 'Auth');

export const AuthController = {
  /**
   * @swagger
   * /auth/register:
   *   post:
   *     tags:
   *       - Authentication
   *     summary: Đăng ký tài khoản mới
   *     description: Tạo tài khoản user mới với email, password và tên (optional)
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             required:
   *               - email
   *               - password
   *             properties:
   *               email:
   *                 type: string
   *                 format: email
   *                 example: "user@example.com"
   *               password:
   *                 type: string
   *                 minLength: 6
   *                 example: "password123"
   *               name:
   *                 type: string
   *                 example: "Nguyễn Văn A"
   *     responses:
   *       201:
   *         description: Đăng ký thành công
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 id:
   *                   type: string
   *                   format: uuid
   *                 email:
   *                   type: string
   *                 name:
   *                   type: string
   *                 role:
   *                   type: string
   *                   enum: [USER, ADMIN]
   *                 createdAt:
   *                   type: string
   *                   format: date-time
   *       409:
   *         description: Email đã tồn tại
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 message:
   *                   type: string
   *                   example: "Email already exists"
   *       400:
   *         description: Dữ liệu không hợp lệ
   */
  async register(req: Request, res: Response) {
    try {
      // Gọi service để xử lý business logic
      const user = await AuthService.register(req.body.email, req.body.password, req.body.name);
      // Trả về user info (không có password) với status 201
      return res.status(201).json(user);
    } catch (e: any) {
      return handleAuthError(e, res);
    }
  },

  /**
   * @swagger
   * /auth/login:
   *   post:
   *     tags:
   *       - Authentication
   *     summary: Đăng nhập
   *     description: Xác thực user và trả về JWT tokens
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             required:
   *               - email
   *               - password
   *             properties:
   *               email:
   *                 type: string
   *                 format: email
   *                 example: "user@example.com"
   *               password:
   *                 type: string
   *                 example: "password123"
   *     responses:
   *       200:
   *         description: Đăng nhập thành công
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 accessToken:
   *                   type: string
   *                   description: JWT access token (hết hạn sau 15 phút)
   *                 refreshToken:
   *                   type: string
   *                   description: JWT refresh token (hết hạn sau 7 ngày)
   *                 user:
   *                   type: object
   *                   properties:
   *                     id:
   *                       type: string
   *                       format: uuid
   *                     email:
   *                       type: string
   *                     name:
   *                       type: string
   *                     role:
   *                       type: string
   *                       enum: [USER, ADMIN]
   *       401:
   *         description: Credentials không đúng
   */
  async login(req: Request, res: Response) {
    try {
      // Gọi service với metadata từ request (IP, User-Agent để tracking)
      // Service sẽ handle toàn bộ logic: check user, verify password, và trả về tokens + user
      const result = await AuthService.login(req.body.email, req.body.password, {
        ip: req.ip, // IP address của client
        userAgent: req.headers['user-agent'], // User agent string
      });

      // Trả về tokens và user info
      return res.json({
        accessToken: result.accessToken,
        refreshToken: result.refreshToken,
        user: result.user
      });
    } catch (e: any) {
      return handleAuthError(e, res);
    }
  },

  /**
   * @swagger
   * /auth/refresh:
   *   post:
   *     tags:
   *       - Authentication
   *     summary: Làm mới access token
   *     description: Sử dụng refresh token để tạo access token mới và refresh token mới (token rotation)
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             required:
   *               - refreshToken
   *             properties:
   *               refreshToken:
   *                 type: string
   *                 example: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
   *     responses:
   *       200:
   *         description: Token refreshed thành công
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 accessToken:
   *                   type: string
   *                   description: JWT access token mới
   *                 refreshToken:
   *                   type: string
   *                   description: JWT refresh token mới
   *       401:
   *         description: Refresh token không hợp lệ hoặc đã hết hạn
   */
  async refresh(req: Request, res: Response) {
    try {
      // Gọi service để refresh tokens (token rotation)
      const tokens = await AuthService.refresh(req.body.refreshToken);
      return res.json(tokens);
    } catch (e: any) {
      return handleAuthError(e, res);
    }
  },

  /**
   * @swagger
   * /auth/logout:
   *   post:
   *     tags:
   *       - Authentication
   *     summary: Đăng xuất
   *     description: Thu hồi refresh token để ngăn chặn việc sử dụng lại
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             required:
   *               - refreshToken
   *             properties:
   *               refreshToken:
   *                 type: string
   *                 example: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
   *     responses:
   *       204:
   *         description: Đăng xuất thành công
   *       401:
   *         description: Refresh token không hợp lệ
   */
  async logout(req: Request, res: Response) {
    // Xóa refresh token khỏi database (revoke token)
    await AuthService.logout(req.body.refreshToken);
    // Trả về 204 No Content (thành công, không có response body)
    return res.status(204).send();
  },
};
