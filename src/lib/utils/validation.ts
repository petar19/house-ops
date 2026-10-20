import { z } from 'zod';

export const subitemSchema = z.object({
  name: z.string(),
  price: z.number(),
  count: z.number().optional(),
});

export const expenseLocationSchema = z.object({
  lat: z.number(),
  lng: z.number(),
  label: z.string().optional(),
});

export const expenseImportSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().optional(),
  // Negative is valid: money received (e.g. salary), the opposite of an expense.
  price: z.number().refine((n) => n !== 0, 'price must not be zero'),
  itemCount: z.number().optional(),
  paidBy: z.string(),
  categories: z.array(z.string()),
  date: z.string(),
  location: expenseLocationSchema.nullable(),
  subitems: z.array(subitemSchema),
  createdBy: z.string(),
  createdAt: z.number(),
  source: z.enum(['manual', 'migrated', 'whatsapp-bot']),
});

export const expenseImportFileSchema = z.array(expenseImportSchema);

export type ExpenseImport = z.infer<typeof expenseImportSchema>;
