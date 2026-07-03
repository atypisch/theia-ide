/********************************************************************************
 * Soriku IDE — agent catalog memoization tests (P3-c2)
 *
 * SPDX-License-Identifier: MIT
 ********************************************************************************/

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { SorikuAgentCatalog } from '../browser/soriku-agent-catalog';

function makeCatalog(): { catalog: SorikuAgentCatalog; calls: () => number; fail: (on: boolean) => void } {
    let fetches = 0;
    let failing = false;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const catalog = new SorikuAgentCatalog() as any;
    catalog.engineClient = {
        listAgents: async () => {
            fetches++;
            if (failing) {
                throw new Error('engine down');
            }
            return { data: [{ id: 'a1' }, { id: 'a2' }], total: 2 };
        },
    };
    return { catalog, calls: () => fetches, fail: on => { failing = on; } };
}

describe('SorikuAgentCatalog', () => {
    it('memoizes: concurrent + repeat callers share one fetch', async () => {
        const { catalog, calls } = makeCatalog();
        const [a, b] = await Promise.all([catalog.getAgents(), catalog.getAgents()]);
        await catalog.getAgents();
        assert.equal(calls(), 1);
        assert.equal(a.length, 2);
        assert.equal(b.length, 2);
    });

    it('force bypasses the memo (the Refresh button)', async () => {
        const { catalog, calls } = makeCatalog();
        await catalog.getAgents();
        await catalog.getAgents(true);
        assert.equal(calls(), 2);
    });

    it('a FAILED fetch clears the memo so the next call retries (no cached error)', async () => {
        const { catalog, calls, fail } = makeCatalog();
        fail(true);
        await assert.rejects(() => catalog.getAgents(), /engine down/);
        fail(false);
        const agents = await catalog.getAgents();   // retries instead of replaying the failure
        assert.equal(agents.length, 2);
        assert.equal(calls(), 2);
    });

    it('invalidate() drops the cache', async () => {
        const { catalog, calls } = makeCatalog();
        await catalog.getAgents();
        catalog.invalidate();
        await catalog.getAgents();
        assert.equal(calls(), 2);
    });
});
