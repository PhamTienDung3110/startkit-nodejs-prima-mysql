/**
 * Swagger Configuration
 * 
 * @description Cấu hình Swagger/OpenAPI cho API documentation
 * - Định nghĩa API schemas và models
 * - Cấu hình security schemes
 * - Scan JSDoc comments từ controllers
 */

import swaggerJSDoc from 'swagger-jsdoc';
import { env } from './env';

/**
 * Swagger Options
 * Cấu hình cho swagger-jsdoc để generate OpenAPI spec
 */
export const swaggerOptions = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'LE Backend API',
      version: '1.0.0',
      description: 'Personal Finance Management API - Quản lý tài chính cá nhân',
      contact: {
        name: 'LE Backend Team',
      },
    },
    servers: [
      {
        url: `http://localhost:${env.PORT}/api`,
        description: 'Development server',
      },
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
        },
      },
      schemas: {
        User: {
          type: 'object',
          properties: {
            id: {
              type: 'string',
              format: 'uuid',
              example: '123e4567-e89b-12d3-a456-426614174000'
            },
            email: {
              type: 'string',
              format: 'email',
              example: 'user@example.com'
            },
            name: {
              type: 'string',
              example: 'Nguyễn Văn A'
            },
            role: {
              type: 'string',
              enum: ['USER', 'ADMIN'],
              example: 'USER'
            },
            createdAt: {
              type: 'string',
              format: 'date-time'
            },
            updatedAt: {
              type: 'string',
              format: 'date-time'
            }
          }
        },
        Wallet: {
          type: 'object',
          properties: {
            id: {
              type: 'string',
              format: 'uuid'
            },
            userId: {
              type: 'string',
              format: 'uuid'
            },
            name: {
              type: 'string',
              example: 'Ví Tiền Mặt'
            },
            type: {
              type: 'string',
              enum: ['cash', 'bank', 'ewallet', 'credit'],
              example: 'cash'
            },
            openingBalance: {
              type: 'number',
              format: 'decimal',
              example: 1000.00
            },
            currentBalance: {
              type: 'number',
              format: 'decimal',
              example: 1500.00
            },
            isArchived: {
              type: 'boolean',
              default: false
            },
            createdAt: {
              type: 'string',
              format: 'date-time'
            },
            updatedAt: {
              type: 'string',
              format: 'date-time'
            }
          }
        },
        Category: {
          type: 'object',
          properties: {
            id: {
              type: 'string',
              format: 'uuid'
            },
            userId: {
              type: 'string',
              format: 'uuid'
            },
            name: {
              type: 'string',
              example: 'Ăn uống'
            },
            type: {
              type: 'string',
              enum: ['income', 'expense'],
              example: 'expense'
            },
            parentId: {
              type: 'string',
              format: 'uuid',
              nullable: true
            },
            icon: {
              type: 'string',
              example: '🍽️'
            },
            sortOrder: {
              type: 'integer',
              default: 0
            },
            isSystem: {
              type: 'boolean',
              default: false
            },
            createdAt: {
              type: 'string',
              format: 'date-time'
            },
            updatedAt: {
              type: 'string',
              format: 'date-time'
            }
          }
        },
        Transaction: {
          type: 'object',
          properties: {
            id: {
              type: 'string',
              format: 'uuid'
            },
            userId: {
              type: 'string',
              format: 'uuid'
            },
            type: {
              type: 'string',
              enum: ['income', 'expense', 'transfer'],
              example: 'expense'
            },
            transactionDate: {
              type: 'string',
              format: 'date-time'
            },
            categoryId: {
              type: 'string',
              format: 'uuid',
              nullable: true
            },
            amount: {
              type: 'number',
              format: 'decimal',
              example: 100.00
            },
            note: {
              type: 'string',
              nullable: true,
              example: 'Ăn trưa tại quán'
            },
            deletedAt: {
              type: 'string',
              format: 'date-time',
              nullable: true
            },
            createdAt: {
              type: 'string',
              format: 'date-time'
            },
            updatedAt: {
              type: 'string',
              format: 'date-time'
            },
            entries: {
              type: 'array',
              items: {
                $ref: '#/components/schemas/TransactionEntry'
              }
            },
            category: {
              $ref: '#/components/schemas/Category'
            }
          }
        },
        TransactionEntry: {
          type: 'object',
          properties: {
            id: {
              type: 'string',
              format: 'uuid'
            },
            transactionId: {
              type: 'string',
              format: 'uuid'
            },
            walletId: {
              type: 'string',
              format: 'uuid'
            },
            direction: {
              type: 'string',
              enum: ['in', 'out'],
              example: 'out'
            },
            amount: {
              type: 'number',
              format: 'decimal',
              example: 100.00
            },
            createdAt: {
              type: 'string',
              format: 'date-time'
            },
            wallet: {
              $ref: '#/components/schemas/Wallet'
            }
          }
        },
        IncomeTransaction: {
          type: 'object',
          required: ['type', 'walletId', 'categoryId', 'transactionDate', 'amount'],
          properties: {
            type: {
              type: 'string',
              enum: ['income']
            },
            walletId: {
              type: 'string',
              format: 'uuid',
              example: '123e4567-e89b-12d3-a456-426614174000'
            },
            categoryId: {
              type: 'string',
              format: 'uuid',
              example: '123e4567-e89b-12d3-a456-426614174001'
            },
            transactionDate: {
              type: 'string',
              format: 'date-time',
              example: '2024-01-21T10:00:00.000Z'
            },
            amount: {
              type: 'number',
              format: 'decimal',
              minimum: 0.01,
              example: 500.00
            },
            note: {
              type: 'string',
              maxLength: 1000,
              example: 'Thu nhập từ lương tháng 1'
            }
          }
        },
        ExpenseTransaction: {
          type: 'object',
          required: ['type', 'walletId', 'categoryId', 'transactionDate', 'amount'],
          properties: {
            type: {
              type: 'string',
              enum: ['expense']
            },
            walletId: {
              type: 'string',
              format: 'uuid',
              example: '123e4567-e89b-12d3-a456-426614174000'
            },
            categoryId: {
              type: 'string',
              format: 'uuid',
              example: '123e4567-e89b-12d3-a456-426614174002'
            },
            transactionDate: {
              type: 'string',
              format: 'date-time',
              example: '2024-01-21T10:00:00.000Z'
            },
            amount: {
              type: 'number',
              format: 'decimal',
              minimum: 0.01,
              example: 100.00
            },
            note: {
              type: 'string',
              maxLength: 1000,
              example: 'Ăn trưa tại nhà hàng'
            }
          }
        },
        TransferTransaction: {
          type: 'object',
          required: ['type', 'fromWalletId', 'toWalletId', 'transactionDate', 'amount'],
          properties: {
            type: {
              type: 'string',
              enum: ['transfer']
            },
            fromWalletId: {
              type: 'string',
              format: 'uuid',
              example: '123e4567-e89b-12d3-a456-426614174000'
            },
            toWalletId: {
              type: 'string',
              format: 'uuid',
              example: '123e4567-e89b-12d3-a456-426614174003'
            },
            transactionDate: {
              type: 'string',
              format: 'date-time',
              example: '2024-01-21T10:00:00.000Z'
            },
            amount: {
              type: 'number',
              format: 'decimal',
              minimum: 0.01,
              example: 200.00
            },
            note: {
              type: 'string',
              maxLength: 1000,
              example: 'Chuyển tiền từ ví tiền mặt sang ví ngân hàng'
            }
          }
        }
      }
    },
    security: [
      {
        bearerAuth: [],
      },
    ],
  },
  apis: [
    './src/routes.ts',
    './src/modules/**/*.controller.ts'
  ],
};

/**
 * Generate Swagger/OpenAPI specification
 */
export const swaggerSpecs = swaggerJSDoc(swaggerOptions);