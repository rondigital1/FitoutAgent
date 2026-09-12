import { ChecklistItem, Suggestion, type DecomposeTool } from '@fitoutagent/shared';
import OpenAI from 'openai';
import { zodTextFormat } from 'openai/helpers/zod';
import { ZodError } from 'zod';
import {
  DECOMPOSE_SYSTEM,
  DecomposeLlmSchema,
  DecomposeStructuredLlmSchema,
  decomposeUserPrompt,
} from './prompts';

const DEFAULT_MODEL = 'gpt-5.6-luna';
const REQUEST_TIMEOUT_MS = 30_000;
const MAX_OUTPUT_TOKENS = 1_200;

function refusalText(response: OpenAI.Responses.Response): string | null {
  for (const output of response.output) {
    if (output.type !== 'message') continue;
    for (const content of output.content) {
      if (content.type === 'refusal') return content.refusal;
    }
  }
  return null;
}

export const llmDecomposer: DecomposeTool = {
  async decompose(input) {
    const key = process.env.AGENT_API_KEY || process.env.OPENAI_API_KEY;
    if (!key) throw new Error('Checklist generation needs AGENT_API_KEY or OPENAI_API_KEY in the server .env. Set it and restart the server.');

    const base = (process.env.AGENT_BASE_URL || 'https://api.openai.com/v1').replace(/\/$/, '');
    const model = process.env.AGENT_DECOMPOSE_MODEL || process.env.AGENT_MODEL || DEFAULT_MODEL;
    const client = new OpenAI({
      apiKey: key,
      baseURL: base,
      timeout: REQUEST_TIMEOUT_MS,
      maxRetries: 2,
    });

    const response = await client.responses.parse({
      model,
      instructions: DECOMPOSE_SYSTEM,
      input: decomposeUserPrompt(input),
      max_output_tokens: MAX_OUTPUT_TOKENS,
      store: false,
      ...(model.startsWith('gpt-5') ? { reasoning: { effort: 'none' as const } } : {}),
      text: {
        format: zodTextFormat(DecomposeStructuredLlmSchema, 'fitoutagent_checklist'),
      },
    }).catch((error: unknown) => {
      if (error instanceof ZodError) {
        throw new Error('Checklist generation returned structured output that failed validation. Please retry.');
      }
      const status = error instanceof OpenAI.APIError ? error.status : undefined;
      const detail = status ? `HTTP ${status}` : 'request failed';
      throw new Error(`Checklist generation failed (${detail}). Check the server API key, model access, network, or quota and retry.`);
    });

    if (response.status !== 'completed') {
      const reason = response.incomplete_details?.reason ?? response.status;
      throw new Error(`Checklist generation returned an incomplete response (${reason}). Please retry.`);
    }
    const refusal = refusalText(response);
    if (refusal) throw new Error(`Checklist generation was refused by the model: ${refusal}`);
    if (!response.output_parsed) throw new Error('Checklist generation returned no structured output. Please retry.');

    const structured = DecomposeStructuredLlmSchema.parse(response.output_parsed);
    const out = DecomposeLlmSchema.parse({
      ...structured,
      items: structured.items.map(({ room, ...item }) => ({
        ...item,
        ...(room === null ? {} : { room }),
      })),
    });
    const items = out.items.map(item => ChecklistItem.parse(item));
    const itemIds = new Set(items.map(i => i.id));
    if (itemIds.size !== items.length) throw new Error('LLM checklist contains duplicate item IDs. Please retry.');
    const labels = new Set(items.map(i => i.label.toLowerCase()));
    const ownedLower = input.owned.map(o => o.toLowerCase());
    const suggestions = (out.suggestions ?? [])
      .map(s => Suggestion.parse(s))
      .filter(s => !itemIds.has(s.id) && !labels.has(s.label.toLowerCase()))
      .filter(s => !ownedLower.some(o =>
        s.label.toLowerCase().includes(o) || s.query.toLowerCase().includes(o) || o.includes(s.id)))
      .filter((s, index, all) => all.findIndex(other => other.id === s.id || other.label.toLowerCase() === s.label.toLowerCase()) === index)
      .slice(0, 5);
    return { items, suggestions };
  },
};
