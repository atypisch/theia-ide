/********************************************************************************
 * Soriku IDE — agent catalog: memoized agent list + startup prefetch (P3-c2)
 *
 * The baseline showed time-to-first-agent-list at ~3.0 s: the fetch only started
 * after shell restore rendered the agents view (request began at ~2.7 s). This
 * catalog kicks the fetch off at application start — parallel with shell
 * startup — and memoizes it, so the view renders from the already-warm promise.
 *
 * Failure-silent by design: a failed prefetch clears the memo, and the next
 * caller (the view's refresh) simply refetches — behavior identical to today's
 * cold path when the engine is down at launch.
 *
 * SPDX-License-Identifier: MIT
 ********************************************************************************/

import { inject, injectable } from '@theia/core/shared/inversify';
import { FrontendApplicationContribution } from '@theia/core/lib/browser/frontend-application-contribution';
import { EngineClient } from 'soriku-engine-client-ext/lib/common/engine-client';
import { AgentPersona } from 'soriku-engine-client-ext/lib/common/engine-types';

@injectable()
export class SorikuAgentCatalog {

    @inject(EngineClient)
    protected readonly engineClient: EngineClient;

    protected inflight: Promise<AgentPersona[]> | undefined;

    /**
     * The agent list, memoized: concurrent callers share one request; a completed
     * request is served from cache until `refresh()`. A FAILED request clears the
     * memo before rethrowing, so the next call retries instead of caching an error.
     */
    getAgents(force = false): Promise<AgentPersona[]> {
        if (force || !this.inflight) {
            this.inflight = this.engineClient.listAgents()
                .then(response => response.data ?? [])
                .catch(error => {
                    this.inflight = undefined;
                    throw error;
                });
        }
        return this.inflight;
    }

    /** Drop the cache so the next getAgents() refetches (e.g. after an agent edit). */
    invalidate(): void {
        this.inflight = undefined;
    }
}

/** Kicks the agent fetch off at app start, parallel with shell restore. */
@injectable()
export class SorikuAgentPrefetch implements FrontendApplicationContribution {

    @inject(SorikuAgentCatalog)
    protected readonly catalog: SorikuAgentCatalog;

    onStart(): void {
        this.catalog.getAgents().catch(() => { /* engine down at launch — view refetches later */ });
    }
}
