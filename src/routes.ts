/**
 * Định nghĩa tất cả API routes của ứng dụng
 * File này tập trung tất cả các endpoint và middleware liên quan
 */
import { Router } from 'express';
import { validateBody } from './middlewares/validate.middleware';
import { requireAuth, requireRole } from './middlewares/auth.middleware';

import { AuthController } from './modules/auth/auth.controller';
import { registerSchema, loginSchema, refreshSchema } from './modules/auth/auth.schema';
import { UsersController } from './modules/users/users.controller';
import { TransactionController } from './modules/transaction/transaction.controller';
import { createTransactionSchema, updateTransactionSchema } from './modules/transaction/transaction.schema';
import { WalletController } from './modules/wallet/wallet.controller';
import { createWalletSchema, updateWalletSchema, getWalletsQuerySchema } from './modules/wallet/wallet.schema';
import { CategoryController } from './modules/category/category.controller';
import { createCategorySchema, updateCategorySchema, getCategoriesQuerySchema, createFromTemplateSchema } from './modules/category/category.schema';
import { LoanController } from './modules/loan/loan.controller';
import { createLoanSchema, updateLoanSchema, createLoanPaymentSchema, getLoansQuerySchema, getLoanPaymentsQuerySchema } from './modules/loan/loan.schema';
import { TransactionTemplateController } from './modules/transaction-template/transaction-template.controller';
import { createTemplateSchema, createTemplateFromTransactionSchema, updateTemplateSchema } from './modules/transaction-template/transaction-template.schema';
import { GoalController } from './modules/goal/goal.controller';
import { createGoalSchema, updateGoalSchema, createMilestoneSchema, updateMilestoneSchema } from './modules/goal/goal.schema';
import { PendingTransactionController } from './modules/pending-transaction/pending-transaction.controller';
import { updatePendingTransactionSchema } from './modules/pending-transaction/pending-transaction.schema';
import { NoteController } from './modules/note/note.controller';
import { createNotebookSchema, updateNotebookSchema, createSessionSchema, updateSessionSchema } from './modules/note/note.schema';

// Tạo router instance để định nghĩa các routes
export const routes = Router();

// ========== Authentication Routes ==========
// Đăng ký tài khoản mới - validate body với registerSchema
routes.post('/auth/register', validateBody(registerSchema), AuthController.register);
// Đăng nhập - validate body với loginSchema
routes.post('/auth/login', validateBody(loginSchema), AuthController.login);
// Làm mới access token bằng refresh token - validate body với refreshSchema
routes.post('/auth/refresh', validateBody(refreshSchema), AuthController.refresh);
// Đăng xuất - xóa refresh token
routes.post('/auth/logout', validateBody(refreshSchema), AuthController.logout);

// ========== User Routes ==========
// Lấy thông tin user hiện tại - yêu cầu authentication
routes.get('/users/me', requireAuth, UsersController.me);
// Lấy danh sách users - yêu cầu authentication và role ADMIN
routes.get('/users', requireAuth, requireRole(['ADMIN']), UsersController.list);

// ========== Transaction Routes ==========
routes.get('/transactions/pending', requireAuth, PendingTransactionController.getPendingTransactions);
routes.post('/transactions/pending/test-email', requireAuth, PendingTransactionController.testEmail);
routes.patch('/transactions/pending/:id/status', requireAuth, validateBody(updatePendingTransactionSchema), PendingTransactionController.updateStatus);
routes.post('/transactions', requireAuth, validateBody(createTransactionSchema), TransactionController.createTransaction);
routes.get('/transactions', requireAuth, TransactionController.getTransactions);
routes.put('/transactions/:id', requireAuth, validateBody(updateTransactionSchema), TransactionController.updateTransaction);
routes.delete('/transactions/:id', requireAuth, TransactionController.deleteTransaction);

// ========== Wallet Routes ==========
routes.post('/wallets', requireAuth, validateBody(createWalletSchema), WalletController.createWallet);
routes.get('/wallets', requireAuth, WalletController.getWallets);
routes.get('/wallets/stats/summary', requireAuth, WalletController.getWalletStats);
routes.get('/wallets/:id', requireAuth, WalletController.getWallet);
routes.put('/wallets/:id', requireAuth, validateBody(updateWalletSchema), WalletController.updateWallet);
routes.delete('/wallets/:id', requireAuth, WalletController.deleteWallet);

// ========== Category Routes ==========
routes.post('/categories', requireAuth, validateBody(createCategorySchema), CategoryController.createCategory);
routes.post('/categories/from-template', requireAuth, validateBody(createFromTemplateSchema), CategoryController.createFromTemplate);
routes.get('/categories', requireAuth, CategoryController.getCategories);
routes.get('/categories/templates', CategoryController.getTemplates);
routes.get('/categories/:id', requireAuth, CategoryController.getCategory);
routes.put('/categories/:id', requireAuth, validateBody(updateCategorySchema), CategoryController.updateCategory);
routes.delete('/categories/:id', requireAuth, CategoryController.deleteCategory);

// ========== Loan Routes ==========
routes.post('/loans', requireAuth, validateBody(createLoanSchema), LoanController.createLoan);
routes.get('/loans', requireAuth, LoanController.getLoans);
routes.get('/loans/stats/summary', requireAuth, LoanController.getLoanStats);
routes.get('/loans/:id', requireAuth, LoanController.getLoan);
routes.put('/loans/:id', requireAuth, validateBody(updateLoanSchema), LoanController.updateLoan);
routes.delete('/loans/:id', requireAuth, LoanController.deleteLoan);

// ========== Loan Payment Routes ==========
routes.post('/loan-payments', requireAuth, validateBody(createLoanPaymentSchema), LoanController.createLoanPayment);
routes.get('/loan-payments', requireAuth, LoanController.getLoanPayments);

// ========== Transaction Template Routes ==========
routes.post('/transaction-templates', requireAuth, validateBody(createTemplateSchema), TransactionTemplateController.createTemplate);
routes.post('/transaction-templates/from-transaction', requireAuth, validateBody(createTemplateFromTransactionSchema), TransactionTemplateController.createTemplateFromTransaction);
routes.get('/transaction-templates', requireAuth, TransactionTemplateController.getTemplates);
routes.get('/transaction-templates/:id', requireAuth, TransactionTemplateController.getTemplate);
routes.put('/transaction-templates/:id', requireAuth, validateBody(updateTemplateSchema), TransactionTemplateController.updateTemplate);
routes.delete('/transaction-templates/:id', requireAuth, TransactionTemplateController.deleteTemplate);

// ========== Goal Routes ==========
routes.post('/goals', requireAuth, validateBody(createGoalSchema), GoalController.createGoal);
routes.get('/goals', requireAuth, GoalController.getGoals);
routes.get('/goals/stats/summary', requireAuth, GoalController.getGoalStats);
routes.get('/goals/:id', requireAuth, GoalController.getGoal);
routes.put('/goals/:id', requireAuth, validateBody(updateGoalSchema), GoalController.updateGoal);
routes.delete('/goals/:id', requireAuth, GoalController.deleteGoal);

// ========== Milestone Routes ==========
routes.post('/goals/milestones', requireAuth, validateBody(createMilestoneSchema), GoalController.createMilestone);
routes.put('/goals/milestones/:id', requireAuth, validateBody(updateMilestoneSchema), GoalController.updateMilestone);
routes.delete('/goals/milestones/:id', requireAuth, GoalController.deleteMilestone);

// ========== Webhooks Routes ==========
routes.post('/webhooks/email-inbound', PendingTransactionController.inboundWebhook);

// ========== Note / Learning Journal Routes ==========
// NoteBook (Khóa học)
routes.get('/notebooks',     requireAuth, NoteController.getNotebooks);
routes.post('/notebooks',    requireAuth, validateBody(createNotebookSchema), NoteController.createNotebook);
routes.put('/notebooks/:id', requireAuth, validateBody(updateNotebookSchema), NoteController.updateNotebook);
routes.delete('/notebooks/:id', requireAuth, NoteController.deleteNotebook);
// Sessions của một notebook
routes.get('/notebooks/:notebookId/sessions', requireAuth, NoteController.getSessions);
// NoteSession (Buổi học)
routes.post('/note-sessions',    requireAuth, validateBody(createSessionSchema), NoteController.createSession);
routes.put('/note-sessions/:id', requireAuth, validateBody(updateSessionSchema), NoteController.updateSession);
routes.delete('/note-sessions/:id', requireAuth, NoteController.deleteSession);
