import type { DiscoveryIssue, Offer, Requirements } from '@settlein/shared';

/** Bound retailer requests so a slow provider cannot leave the search spinning forever. */
export async function fetchRetailer(url: string | URL, init: RequestInit = {}) {
  const response = await fetch(url, { ...init, signal: AbortSignal.timeout(12_000) });
  if (!response.ok) throw new Error(`Retailer returned HTTP ${response.status}`);
  return response;
}

/** Limit concurrency and preserve successful lines when another query fails. */
export async function searchItems(
  requirements: Requirements,
  search: (item: Requirements['items'][number]) => Promise<Offer[]>,
  onIssue?: (issue: DiscoveryIssue) => void,
): Promise<Offer[]> {
  const batches: Offer[][] = new Array(requirements.items.length);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(4, requirements.items.length) }, async () => {
    while (next < requirements.items.length) {
      const index = next++;
      const item = requirements.items[index];
      try {
        batches[index] = await search(item);
      } catch (error) {
        const message = error instanceof Error && /^Retailer returned HTTP \d+$/.test(error.message)
          ? error.message
          : error instanceof Error && ['TimeoutError', 'AbortError'].includes(error.name)
            ? 'Search timed out. Try again.' : 'Search failed. Check retailer configuration and try again.';
        onIssue?.({ checklistItemId: item.id, message });
        batches[index] = [];
      }
    }
  }));
  return batches.flat();
}
