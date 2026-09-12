import { HttpAgent } from '@ag-ui/client';
import { agentUrl } from './agent-base';

const savedId = localStorage.getItem('fitoutagent-thread');
const threadId = savedId && /^[a-zA-Z0-9-]{1,80}$/.test(savedId) ? savedId : crypto.randomUUID();
localStorage.setItem('fitoutagent-thread', threadId);

export const setupAgent = new HttpAgent({
  agentId: 'fitoutagent', threadId,
  url: agentUrl,
});
