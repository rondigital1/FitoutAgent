import { mkdir, readFile, writeFile, rename } from 'node:fs/promises';
import { resolve } from 'node:path';
import { restoreState, type State } from '@settlein/shared';
/** Server-only seam. No vendor API is assumed. TODO: implement the confirmed Ambiguous contract. */
export interface AmbiguousAdapter { saveSetupPlan(state: State): Promise<void>; loadSetupPlan(id: string): Promise<State | null> }
export class LocalAmbiguousAdapter implements AmbiguousAdapter {
  constructor(private directory = resolve(process.env.DATA_DIR ?? '.data')) {}
  private path(id: string) {
    if (!/^[a-zA-Z0-9-]{1,80}$/.test(id)) throw new Error('Invalid setup ID');
    return resolve(this.directory, `${id}.json`);
  }
  async saveSetupPlan(state: State) {
    await mkdir(this.directory, { recursive: true });
    const path = this.path(state.id);
    await writeFile(`${path}.tmp`, JSON.stringify(state, null, 2));
    await rename(`${path}.tmp`, path);
  }
  async loadSetupPlan(id: string): Promise<State | null> {
    try { return restoreState(id, JSON.parse(await readFile(this.path(id), 'utf8'))); }
    catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null; throw error; }
  }
}
