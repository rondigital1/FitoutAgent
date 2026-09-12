import type { BrowserCartTool, CartRequest, CartResult } from '@fitoutagent/shared';
import { shopifyEnabled, storefront } from '../discovery/shopify';

/**
 * FACT: Shopify Storefront cartCreate + cart query + checkoutUrl.
 * https://shopify.dev/docs/storefronts/headless/building-with-the-storefront-api/cart/manage
 * cost fields are ESTIMATES — not final tax/shipping. checkoutUrl ≠ paid order.
 */
const CART_CREATE = `#graphql
  mutation CartCreate($lines: [CartLineInput!]!) {
    cartCreate(input: { lines: $lines }) {
      cart {
        id
        checkoutUrl
        lines(first: 50) {
          nodes {
            quantity
            merchandise { ... on ProductVariant { id } }
          }
        }
        cost {
          subtotalAmount { amount }
          totalAmount { amount }
        }
      }
      userErrors { message }
    }
  }`;

const CART_QUERY = `#graphql
  query Cart($id: ID!) {
    cart(id: $id) {
      id
      checkoutUrl
      lines(first: 50) {
        nodes {
          quantity
          merchandise { ... on ProductVariant { id } }
        }
      }
    }
  }`;

type CartPayload = {
  id: string;
  checkoutUrl?: string;
  lines: { nodes: Array<{ quantity: number; merchandise?: { id?: string } }> };
};

const carts = new Map<string, string>(); // request.id -> cart GID

function quantitiesByVariant(lines: CartRequest['lines']) {
  const quantities = new Map<string, number>();
  for (const line of lines) {
    if (line.owner !== 'fitoutagent') continue;
    const id = line.id.replace(/^Shopify:/, '');
    quantities.set(id, (quantities.get(id) ?? 0) + line.quantity);
  }
  return quantities;
}

export const shopifyCart: BrowserCartTool = {
  async prepare(request: CartRequest) {
    if (!shopifyEnabled()) throw new Error('Shopify Storefront credentials not configured');
    if (request.retailer !== 'Shopify') throw new Error('shopifyCart only handles Shopify baskets');
    const lines = [...quantitiesByVariant(request.lines)]
      .map(([merchandiseId, quantity]) => ({ quantity, merchandiseId }));
    const data = await storefront<{
      cartCreate: { cart: CartPayload | null; userErrors: Array<{ message: string }> };
    }>(CART_CREATE, { lines });
    if (data.cartCreate.userErrors?.length) throw new Error(data.cartCreate.userErrors.map(e => e.message).join('; '));
    if (!data.cartCreate.cart?.id) throw new Error('Shopify cartCreate returned no cart');
    carts.set(request.id, data.cartCreate.cart.id);
  },

  async verify(request: CartRequest): Promise<CartResult> {
    const cartId = carts.get(request.id);
    if (!cartId) {
      return { id: request.id, retailer: 'Shopify', mock: false, verified: false, lines: [], error: 'No prepared Shopify cart' };
    }
    try {
      const data = await storefront<{ cart: CartPayload | null }>(CART_QUERY, { id: cartId });
      const cart = data.cart;
      if (!cart) {
        return { id: request.id, retailer: 'Shopify', mock: false, verified: false, lines: [], error: 'Shopify cart missing on readback' };
      }
      const lines = (cart.lines?.nodes ?? []).map(n => ({
        id: n.merchandise?.id ? `Shopify:${n.merchandise.id}` : 'unknown',
        quantity: n.quantity,
        owner: 'fitoutagent' as const,
      }));
      const wanted = quantitiesByVariant(request.lines);
      const actual = quantitiesByVariant(lines);
      const verified = wanted.size === actual.size && [...wanted].every(
        ([id, quantity]) => actual.get(id) === quantity);
      return {
        id: request.id,
        retailer: 'Shopify',
        mock: false,
        verified,
        lines: [
          { id: 'existing-note', quantity: 1, owner: 'existing' }, // placeholder: Storefront cart has no prior browser cart
          ...lines,
        ],
        checkoutUrl: cart.checkoutUrl,
        error: verified ? undefined : 'Shopify cart lines did not match request',
      };
    } catch (e) {
      return { id: request.id, retailer: 'Shopify', mock: false, verified: false, lines: [], error: String(e) };
    }
  },
};
