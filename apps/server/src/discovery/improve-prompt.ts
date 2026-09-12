import OpenAI from 'openai';
import { zodTextFormat } from 'openai/helpers/zod';
import { z } from 'zod';
import type { State } from '@fitoutagent/shared';
import {
  AGENT_IMPROVE_PROMPT_SYSTEM,
  IMPROVE_PROMPT_SYSTEM,
  improvePromptUserInput,
} from './prompts';

const ImprovedPrompt = z.object({
  prompt: z.string().trim().min(1).max(500),
  /** Short note for the UI log — what changed. Optional. */
  rationale: z.string().trim().max(200).optional(),
});

export type ImproveMode = 'review' | 'agent';

export const promptImprover = {
  async improve(state: State, mode: ImproveMode = 'review'): Promise<{ prompt: string; rationale?: string }> {
    const key = process.env.AGENT_API_KEY || process.env.OPENAI_API_KEY;
    if (!key) {
      if (mode === 'agent') {
        // Autonomous mode still proceeds with the raw goal when no key.
        return { prompt: state.draft?.goal?.trim() || '', rationale: 'Kept your original prompt (no LLM key for rewrite).' };
      }
      throw new Error('Prompt improvement needs the agent API key. Your current project is kept.');
    }
    const original = state.draft?.goal?.trim();
    if (!original) throw new Error('No prompt to improve.');

    const client = new OpenAI({
      apiKey: key,
      baseURL: process.env.AGENT_BASE_URL || 'https://api.openai.com/v1',
      timeout: 30_000,
      maxRetries: 0,
    });
    const model = process.env.AGENT_MODEL || process.env.AGENT_DECOMPOSE_MODEL || 'gpt-5.6-luna';
    const instructions = mode === 'agent' ? AGENT_IMPROVE_PROMPT_SYSTEM : IMPROVE_PROMPT_SYSTEM;

    try {
      const response = await client.responses.parse({
        model,
        store: false,
        max_output_tokens: 1200,
        ...(model.startsWith('gpt-5') ? { reasoning: { effort: 'none' as const } } : {}),
        instructions,
        input: improvePromptUserInput({
          originalPrompt: original,
          mode,
          requirements: mode === 'review' ? state.requirements : undefined,
          skippedCategories: mode === 'review'
            ? state.requirements?.items.filter(item => state.skippedItemIds.includes(item.id)).map(item => item.label)
            : undefined,
          owned: state.draft?.owned,
          budgetCents: state.draft?.budget ?? null,
          deadline: state.draft?.deadline ?? null,
        }),
        text: { format: zodTextFormat(ImprovedPrompt, 'improved_shopping_prompt') },
      });
      if (response.status !== 'completed' || !response.output_parsed) throw new Error('No complete prompt');
      const parsed = ImprovedPrompt.parse(response.output_parsed);
      const prompt = parsed.prompt.trim().slice(0, 500);
      if (!prompt) throw new Error('Empty improved prompt');
      // Never regress to empty; if model returns identical junk, keep original
      return {
        prompt,
        rationale: parsed.rationale?.trim() || (prompt === original ? 'Prompt already clear.' : 'Clarified your goal for shopping.'),
      };
    } catch (e) {
      if (mode === 'agent') {
        return { prompt: original, rationale: 'Kept your original prompt after rewrite failed.' };
      }
      throw new Error('The agent could not improve your prompt. Your current project is kept. Please try again.');
    }
  },
};
