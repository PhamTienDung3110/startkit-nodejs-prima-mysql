/**
 * Cấu hình và khởi tạo Prisma Client với MariaDB adapter
 * File này tạo singleton instance của PrismaClient để sử dụng trong toàn bộ ứng dụng
 */
import { PrismaClient } from '@prisma/client';
import { PrismaMariaDb } from '@prisma/adapter-mariadb';

// Đọc thông tin kết nối database từ environment variables
const host = process.env.DB_HOST ?? '127.0.0.1';
const port = Number(process.env.DB_PORT ?? 3306);
const user = process.env.DB_USER;
const password = process.env.DB_PASSWORD;
const database = process.env.DB_NAME;

// Validate các biến môi trường bắt buộc
if (!user) throw new Error('DB_USER is missing');
if (password === undefined) throw new Error('DB_PASSWORD is missing');
if (!database) throw new Error('DB_NAME is missing');

// Tạo MariaDB adapter với object config (ổn định hơn URL string trên một số môi trường)
// connectionLimit: 5 - giới hạn số kết nối đồng thời
const adapter = new PrismaMariaDb({
  host,
  port,
  user,
  password,
  database,
  connectionLimit: 5,
});

// Export PrismaClient instance - singleton pattern
export const prisma = new PrismaClient({ adapter } as any);

// Xử lý graceful shutdown - đóng kết nối database khi ứng dụng tắt
process.on('SIGINT', async () => {
  await prisma.$disconnect();
  process.exit(0);
});
process.on('SIGTERM', async () => {
  await prisma.$disconnect();
  process.exit(0);
});
