import { CartRequest } from '@fitoutagent/shared';
import { mockCart } from './mock-cart';
chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(console.error);
const cart = mockCart({
  async get(key) { return (await chrome.storage.local.get(key))[key]; },
  async set(key, value) { await chrome.storage.local.set({ [key]: value }); },
});
let queue = Promise.resolve();
chrome.runtime.onMessage.addListener((message, sender, respond) => {
  if (sender.id !== chrome.runtime.id || message.type !== 'FITOUTAGENT_MOCK_CART') return false;
  const parsed = CartRequest.safeParse(message.request);
  if (!parsed.success) { respond({ error: 'Invalid cart request' }); return false; }
  queue = queue.then(async () => {
    try { await cart.prepare(parsed.data); respond(await cart.verify(parsed.data)); }
    catch (error) { respond({ error: String(error) }); }
  });
  return true;
});
