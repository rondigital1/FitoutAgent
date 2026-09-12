import { z } from 'zod';

export const FitCheck = z.object({
  requirement: z.string().min(1).max(240),
  status: z.enum(['supported', 'conflict', 'unknown']),
  evidence: z.string().max(600),
});
export const ProductFit = z.object({
  status: z.enum(['verified', 'rejected', 'unknown']),
  checks: z.array(FitCheck).max(20),
  summary: z.string().max(300),
  assessedAt: z.string(),
  failure: z.enum(['credentials', 'provider']).optional(),
});
export type ProductFit = z.infer<typeof ProductFit>;
