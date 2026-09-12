import { CartRequest, type CartResult, type BrowserCartTool } from '@fitoutagent/shared';
type Store = { get(key: string): Promise<unknown>; set(key: string, value: unknown): Promise<void> };
export function mockCart(store: Store): BrowserCartTool {
  return {
    async prepare(input) {
      const request = CartRequest.parse(input);
      const key = `mock-cart-${request.retailer}`;
      const current = await store.get(key) as CartResult['lines'] | undefined;
      const existing = (current ?? [{ id: 'existing-notebook', quantity: 1, owner: 'existing' }]).filter(l => l.owner === 'existing');
      await store.set(key, [...existing, ...request.lines]);
    },
    async verify(request) {
      const lines = (await store.get(`mock-cart-${request.retailer}`) ?? []) as CartResult['lines'];
      return {
        id: request.id,
        retailer: request.retailer,
        mock: true,
        lines,
        verified: request.lines.every(w => lines.some(l => l.id === w.id && l.quantity === w.quantity && l.owner === w.owner)),
      };
    },
  };
}
export const previewCart = mockCart({
  async get(key) { const value = localStorage.getItem(key); return value ? JSON.parse(value) : undefined; },
  async set(key, value) { localStorage.setItem(key, JSON.stringify(value)); },
});
