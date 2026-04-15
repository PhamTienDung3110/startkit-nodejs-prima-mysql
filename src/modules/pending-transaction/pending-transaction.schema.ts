import { z } from 'zod';
import { TransactionType } from '@prisma/client';

export const inboundEmailWebhookSchema = z.object({
  // Tùy theo SendGrid hay Mailgun, ta lấy generic fields
  // Ở đây giả lập lấy generic
  sender: z.string().optional(),
  recipient: z.string().optional(),
  subject: z.string().optional(),
  text: z.string().optional(),
  'body-plain': z.string().optional(), // Mailgun
});

export const updatePendingTransactionSchema = z.object({
  status: z.enum(['pending', 'approved', 'rejected']),
});
