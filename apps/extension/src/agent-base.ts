/** Local runtime origin. Retailer images are proxied through it so the panel never
 * contacts a retailer host directly (see apps/server/src/images.ts). */
export const agentUrl = (import.meta.env.VITE_AGENT_URL ?? 'http://127.0.0.1:4100/agent').replace(/\/$/, '');
export const agentBase = agentUrl.replace(/\/agent$/, '');
