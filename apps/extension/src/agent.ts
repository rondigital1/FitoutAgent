import { HttpAgent } from '@ag-ui/client';
import { agentUrl } from './agent-base';

const savedId = localStorage.getItem('settlein-thread');
const threadId = savedId && /^[a-zA-Z0-9-]{1,80}$/.test(savedId) ? savedId : crypto.randomUUID();
localStorage.setItem('settlein-thread', threadId);

export const setupAgent = new HttpAgent({
  agentId: 'settlein', threadId,
  url: agentUrl,
});
