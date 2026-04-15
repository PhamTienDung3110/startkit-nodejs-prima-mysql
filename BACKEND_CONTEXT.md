# LE Backend Content (Node.js/Express API Application)

Tài liệu này chứa context chuyên biệt cho phần Backend API của ứng dụng Tài chính cá nhân LE. Ở các phiên trợ lý sau, khi viết API hay thao tác Database, hãy yêu cầu đọc file này.

## 1. Công nghệ & Thư viện
- **Core Platform**: Node.js 18+, Express.js v5.2, TypeScript 5.9.
- **ORM & Database**: 
  - ORM: Prisma v7.2 - Cấu trúc schema nằm trong `prisma/schema.prisma`.
  - Database: MySQL / MariaDB (Kết nối thông qua `@prisma/adapter-mariadb`).
- **Security & Validation**: 
  - Xác thực người dùng (Auth): JSON Web Token (`jsonwebtoken`), Hash mật khẩu bằng `bcrypt`.
  - Bảo mật kết nối API: `cors`, `helmet`.
  - Xác thực đầu vào (Input Validation): Parse và chuẩn hóa request body chặt chẽ với `zod` schema trước khi vào controller.
- **Logging**: Quản lý ghi log performant với `pino`, `pino-http`, hiển thị trên dev với `pino-pretty`.

## 2. Kiến trúc & Cấu trúc thư mục (Domain-Driven)
Codebase tách biệt tính năng theo Domain modules:
- `src/server.ts` & `src/app.ts`: Nơi bắt đầu quá trình setup Express App, kết nối Middleware và Mount Routers.
- `src/routes.ts`: Root tập trung tất cả API Endpoints.
- `src/config/`: Lưu cấu trúc biến môi trường và thiết lập chung hệ thống.
- `src/db/`: Lưu config Adapter cho Prisma Client.
- `src/middlewares/`: Nơi chặn luồng check (Kiểm tra quyền req.user từ token, bắt lỗi Global error, check Zod Schema từ Body).
- `src/modules/<tên_tính_năng>/`:
  1. `*.schema.ts`: Dùng Zod khai báo Type request sẽ gửi lên.
  2. `*.controller.ts`: Tiếp nhận HTTP Request (đã đi qua validator schema), gọi logic Service, trả kết quả JSON format chuẩn (Response format).
  3. `*.service.ts`: Xử lý nghiệp vụ nặng, thao tác (query/update) xuống Prisma Client db. Ngăn cách tuyệt đối không đẩy req, res vào đây.
- `src/utils/`: Công cụ phụ trợ như Utils băm JWT hay Hash.

## 3. Tổng quan Cấu trúc Dữ liệu & Business Logic (Prisma)
- **User / Auth**: Authentication phân loại 2 vai trò `USER` và `ADMIN`. Dùng cơ chế Token Rotation qua bảng riêng `RefreshToken`.
- **Wallet**: Cột quan trọng là `currentBalance`. Mọi thao tác làm thay đổi số dư này *BẮT BUỘC* phải được thực hiện thông qua Logic Giao dịch (không sửa tay tuỳ tiện).
- **Transaction & TransactionEntry**:
  - `Transaction` chịu trách nhiệm làm header thông tin của giao dịch.
  - Các bút toán dòng tiền in/out qua `TransactionEntry`. Khi insert/update một giao dịch, service phải dùng db transaction để cộng/trừ đồng thời vào số dư `currentBalance` của ví liên quan.
  - Hỗ trợ giao dịch kiểu Thu, Chi và Chuyển ví nội bộ.
- **Loans & Payments (Vay/Cho mượn)**: Luôn đi kèm ít nhất một `Transaction` thật để đẩy dữ liệu ví. Bảng Loan theo dõi tiến độ nợ/thu nợ.
- **Goals (Mục tiêu)**: Quản lý kế hoạch dài hạn, cấu trúc cây phân cấp (cha/con) và lưu các mốc thời gian (Milestones).

## 4. Quy chuẩn code Backend AI
Cho các lần cập nhật API sau này:
1. **Migrations DB**: Nếu yêu cầu thay đổi logic Prisma Schema, nhớ tạo lệnh hướng dẫn người dùng chạy `npm run prisma:generate` & `prisma migrate dev`.
2. **Type Safety**:
   - Controller và Service phải khai báo chính xác kiểu trả về. Dùng type extract từ Zod schemas (`z.infer<typeof schema>`).
   - Xử lý bất đồng bộ bắt buộc `await`, đặc biệt khi query DB.
3. **Response Structure**:
   - Format đầu ra của API phải đồng nhất, theo cấu trúc: `{"message": "xyz", "data": {}}`
   - Báo lỗi qua Global error middleware, nếu lỗi do người dùng thì quăng lỗi với throw AppError() (nếu có base định nghĩa).

## Hướng dẫn 
Sử dụng cú pháp đính kèm cho mọi tính năng thuộc phần Backend:
**@[d:\dailyos\LE-backend\BACKEND_CONTEXT.md]**
