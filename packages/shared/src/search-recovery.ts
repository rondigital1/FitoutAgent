import { z } from 'zod';

export const RecoveryAttempt = z.object({
  query: z.string().max(400),
  sources: z.array(z.string()).max(4),
  outcome: z.enum(['searching', 'matched', 'no-match', 'unverified', 'source-error']),
  found: z.number().int().nonnegative(),
  reason: z.string().max(300),
});
export const SearchRecovery = z.object({
  status: z.enum(['searching', 'resolved', 'no-match', 'unverified', 'source-error', 'locked', 'limit']),
  message: z.string().max(600),
  attempts: z.array(RecoveryAttempt).max(2),
});
export type SearchRecovery = z.infer<typeof SearchRecovery>;
