import OpenAI from 'openai';
import { zodTextFormat } from 'openai/helpers/zod';
import type { Offer, Requirements } from '@settlein/shared';
import { Assessment, FIT_SYSTEM, unknownFit, validateAssessment } from './assessment';

/** Batches of 20 offers per shopping line, at most three concurrent calls. No invented fallback verdicts. */
export const fitVerifier = {
  async verify(requirements: Requirements, offers: Offer[]): Promise<Offer[]> {
    const result = new Map<string, Offer>();
    const key = process.env.AGENT_API_KEY || process.env.OPENAI_API_KEY;
    const model = process.env.AGENT_FIT_MODEL || process.env.AGENT_MODEL || 'gpt-5.6-luna';
    const client = key ? new OpenAI({ apiKey: key, baseURL: process.env.AGENT_BASE_URL || 'https://api.openai.com/v1', timeout: 30_000, maxRetries: 0 }) : null;
    let next = 0;
    await Promise.all(Array.from({ length: Math.min(3, requirements.items.length) }, async () => {
      while (next < requirements.items.length) {
        const item = requirements.items[next++];
        const candidates = offers.filter(o => o.checklistItemId === item.id);
        const live = candidates.filter(o => o.source !== 'Mock');
        for (const offer of candidates) result.set(offer.id, { ...offer, match: 'alternative', fit: unknownFit() });
        // Demo fixtures are explicitly identified; never label simulated facts as retailer verification.
        for (const offer of candidates.filter(o => o.source === 'Mock')) result.set(offer.id, {
          ...offer, match: 'alternative', fit: unknownFit('Demo product: specifications are simulated and need review.'),
        });
        if (!client || !live.length) continue;
        for (let offset = 0; offset < live.length; offset += 20) {
          const batch = live.slice(offset, offset + 20);
          try {
            const response = await client.responses.parse({
              model, instructions: FIT_SYSTEM, store: false, max_output_tokens: 6500,
              ...(model.startsWith('gpt-5') ? { reasoning: { effort: 'none' as const } } : {}),
              input: JSON.stringify({ goal: requirements.goal, owned: requirements.owned, item,
                offers: batch.map(o => ({ id: o.id, name: o.name, description: o.description ?? '', variant: o.variant ?? '', brand: o.brand })) }),
              text: { format: zodTextFormat(Assessment, 'settlein_product_fit') },
            });
            if (response.status !== 'completed' || !response.output_parsed) throw new Error('Incomplete assessment');
            const fits = validateAssessment(response.output_parsed, batch);
            for (const offer of batch) {
              const fit = fits.get(offer.id)!;
              result.set(offer.id, { ...offer, fit, match: fit.status === 'verified' ? 'exact' : 'alternative' });
            }
          } catch {
            for (const offer of batch) result.set(offer.id, { ...offer, match: 'alternative', fit: unknownFit('Fit assessment failed. Review specifications or search again to retry.') });
          }
        }
      }
    }));
    return offers.map(o => result.get(o.id) ?? { ...o, match: 'alternative', fit: unknownFit() });
  },
};
