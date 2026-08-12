/**
 * Cấu hình và khởi tạo Prisma Client với MariaDB adapter (Prisma v7)
 * File này tạo singleton instance của PrismaClient để sử dụng trong toàn bộ ứng dụng
 */
import { PrismaClient } from '@prisma/client';
import { PrismaMariaDb } from '@prisma/adapter-mariadb';

const host = process.env.DB_HOST ?? '127.0.0.1';
const port = Number(process.env.DB_PORT ?? 3306);
const user = process.env.DB_USER ?? 'root';
const password = process.env.DB_PASSWORD ?? '';
const database = process.env.DB_NAME ?? 'pt3';

const adapter = new PrismaMariaDb({
  host,
  port,
  user,
  password,
  database,
  connectionLimit: 30,
  minimumIdle: 2,
  acquireTimeout: 30000,
  connectTimeout: 20000,
});

// Export PrismaClient instance - singleton pattern cho Prisma 7
export const prisma = new PrismaClient({ adapter } as any);

// Graceful shutdown - đóng kết nối database khi ứng dụng tắt
process.on('SIGINT', async () => {
  await prisma.$disconnect();
  process.exit(0);
});
process.on('SIGTERM', async () => {
  await prisma.$disconnect();
  process.exit(0);
});
