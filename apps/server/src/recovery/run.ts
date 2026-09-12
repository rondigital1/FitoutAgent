import type { DiscoveryReport, State, SearchRecovery } from '@settlein/shared';
import { activeDiscoverySources, compositeDiscovery } from '../discovery/composite';
import { fitVerifier } from '../fit/verify';
import { recoveryStrategy, signature } from './strategy';
import { finishRecovery, suitable, unresolved } from './status';

/** Two attempts per line, twelve searches per run, two workers, three minutes to start new work.
 * Emissions are serialized because persistence uses one temporary file per project.
 */
export async function recoverSearch(s: State, emit: (s: State) => Promise<void>, itemIds?: string[]) {
  if (!s.requirements) return;
  const r = s.requirements;
  const items = r.items.filter(item => !s.skippedItemIds.includes(item.id) && (!itemIds || itemIds.includes(item.id)) && unresolved(s, item));
  const sources = activeDiscoverySources().filter(source => source !== 'Mock');
  s.searchRecovery ??= {};
  let writes = Promise.resolve();
  const checkpoint = () => { writes = writes.then(() => emit(s)); return writes; };
  let next = 0, searches = 0;
  const deadline = Date.now() + 180_000;
  await Promise.all(Array.from({ length: Math.min(2, items.length) }, async () => {
    while (next < items.length) {
      const item = items[next++];
      const record: SearchRecovery = { status: 'searching', message: `Recovering the search for ${item.label}.`, attempts: [] };
      s.searchRecovery![item.id] = record;
      const locked = s.offers.find(o => o.checklistItemId === item.id && s.locks.includes(o.id));
      if (locked && !suitable(locked, r)) {
        record.status = 'locked'; record.message = 'This choice is locked and does not have confirmed fit, price or availability. Unlock it to allow a replacement.';
        await checkpoint(); continue;
      }
      if (!sources.length) {
        record.status = 'source-error'; record.message = 'No live retailer is configured for recovery. Configure a retailer and retry; your requirements are unchanged.';
        await checkpoint(); continue;
      }
      const tried = new Set(sources.map(source => signature(item.query, source)));
      for (let round = 0; round < 2 && unresolved(s, item); round++) {
        if (searches >= 12 || Date.now() >= deadline) { record.status = 'limit'; break; }
        searches++;
        s.log.push(`Recovering ${item.label}: planning search ${round + 1} of 2…`);
        await checkpoint();
        const plan = await recoveryStrategy(s, item, sources, tried);
        if (!plan) break;
        if (Date.now() >= deadline) { record.status = 'limit'; break; }
        plan.sources.forEach(source => tried.add(signature(plan.query, source)));
        const attempt: SearchRecovery['attempts'][number] = { ...plan, outcome: 'searching', found: 0 };
        record.attempts.push(attempt);
        s.log.push(`Recovery for ${item.label}: ${plan.sources.join(', ')}; query: ${plan.query}.`);
        await checkpoint();
        const reports: DiscoveryReport[] = [];
        try {
          const found = await compositeDiscovery.discover({ ...r, items: [{ ...item, query: plan.query }] }, undefined, report => reports.push(report), { sources: plan.sources, limit: 10 });
          // Deduplicate within a response, then reassess against ORIGINAL requirements.
          const unique = [...new Map(found.filter(o => o.checklistItemId === item.id).map(o => [o.id, o])).values()];
          const checked = await fitVerifier.verify({ ...r, items: [item] }, unique);
          const merged = new Map(s.offers.map(o => [o.id, o]));
          for (const offer of checked) {
            const previous = merged.get(offer.id);
            // A failed reassessment cannot erase previously obtained evidence for identical data.
            const same = previous && previous.name === offer.name && previous.description === offer.description && previous.variant === offer.variant && previous.brand === offer.brand;
            merged.set(offer.id, same && offer.fit?.summary.includes('assessment failed') ? { ...offer, fit: previous.fit, match: previous.match } : offer);
          }
          s.offers = [...merged.values()];
          attempt.found = checked.length;
          const serviceError = reports.some(report => report.issues.length) || checked.some(o => o.fit?.summary.includes('assessment failed') || !o.fit);
          attempt.outcome = !unresolved(s, item) ? 'matched' : serviceError ? 'source-error' : checked.some(o => o.fit?.status === 'unknown') ? 'unverified' : 'no-match';
        } catch { attempt.outcome = 'source-error'; }
        for (const report of reports) {
          const previous = s.discoveryReports.find(p => p.source === report.source);
          s.discoveryReports = [...s.discoveryReports.filter(p => p.source !== report.source), {
            source: report.source, offerCount: s.offers.filter(o => o.source === report.source).length,
            issues: [...(previous?.issues.filter(issue => issue.checklistItemId !== item.id) ?? []), ...report.issues],
          }];
        }
        await checkpoint();
      }
      finishRecovery(s, item, record);
      s.log.push(`Recovery for ${item.label}: ${record.message}`);
      await checkpoint();
    }
  }));
  await writes;
}
