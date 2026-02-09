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
  const allowedOrigins = process.env.CORS_ORIGIN
    ? process.env.CORS_ORIGIN.split(',')
    : [];

  app.use(cors({
    origin: (origin, callback) => {
      // Cho phép curl, postman, server-to-server
      if (!origin) return callback(null, true);

      if (allowedOrigins.includes(origin)) {
        return callback(null, true);
      }

      console.log('❌ CORS blocked origin:', origin);
      return callback(new Error('Not allowed by CORS'));
    },
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  }));

  // PRE-FLIGHT (RẤT QUAN TRỌNG)
  app.options('*', cors());

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
