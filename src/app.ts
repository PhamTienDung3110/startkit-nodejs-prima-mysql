/**
 * Cấu hình và khởi tạo Express application
 * File này thiết lập các middleware cần thiết và routing cho ứng dụng
 */
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import cookieParser from 'cookie-parser';
import pinoHttp from 'pino-http';
import swaggerUi from 'swagger-ui-express';

import { env } from './config/env';
import { logger } from './config/logger';
import { swaggerSpecs } from './config/swagger';
import { routes } from './routes';
import { errorMiddleware } from './middlewares/error.middleware';


/**
 * Tạo và cấu hình Express app với các middleware
 * @returns Express application instance đã được cấu hình đầy đủ
 */
export function createApp() {
  const app = express();

  // Middleware logging HTTP requests với Pino
  app.use(pinoHttp({ logger }));
  // Middleware bảo mật - thêm các HTTP headers an toàn
  app.use(helmet());
  // Middleware nén response để giảm kích thước
  app.use(compression());
  // Middleware parse cookies từ request
  app.use(cookieParser());
  // Middleware parse JSON body với giới hạn 1MB
  app.use(express.json({ limit: '1mb' }));

  // Cấu hình CORS - cho phép cross-origin requests
  const allowedOrigins = env.CORS_ORIGIN
    ? env.CORS_ORIGIN.split(',').map((origin) => origin.trim())
    : [
        'http://localhost:3001', // Next.js frontend
        'http://localhost:3000', // Alternative frontend port
        'http://localhost:5173', // Vite frontend
      ];

  app.use(
    cors({
      origin: (origin, callback) => {
        // Cho phép requests không có origin (mobile apps, Postman, etc.)
        if (!origin) {
          return callback(null, true);
        }

        // Kiểm tra origin có trong danh sách allowed không
        if (allowedOrigins.includes(origin)) {
          return callback(null, true);
        }

        // Trong development, cho phép tất cả localhost origins
        if (env.NODE_ENV === 'development' && origin.startsWith('http://localhost:')) {
          return callback(null, true);
        }

        // Từ chối origin không được phép
        callback(new Error('Not allowed by CORS'));
      },
      credentials: true, // Cho phép gửi cookies qua CORS
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization'],
    }),
  );

  // Swagger JSON spec endpoint
  app.get('/api-docs.json', (req, res) => {
    res.setHeader('Content-Type', 'application/json');
    res.send(swaggerSpecs);
  });

  // Swagger UI - API documentation
  app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpecs));

  // Health check endpoint - kiểm tra server có hoạt động không
  app.get('/health', (_req, res) => res.json({ ok: true }));

  // API documentation redirect
  app.get('/docs', (_req, res) => res.redirect('/api-docs'));

  // Tất cả API routes được mount tại /api
  app.use('/api', routes);

  // Error handling middleware - xử lý lỗi cuối cùng
  app.use(errorMiddleware);
  return app;
}
