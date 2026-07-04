/********************************************************************************
 * Soriku IDE — chat stream controller (P4-a)
 *
 * Owns the send/stream LIFECYCLE that used to live inside the 1250-line chat
 * widget: abort handling, the SSE for-await loop, event reduction, the typed
 * error mapping (#3/#5/#14) and the tool/plan fan-out. The widget becomes a pure
 * consumer: it hands over params + callbacks and renders the turns it gets back.
 *
 * Deliberately depends on a MINIMAL executor interface instead of the concrete
 * tools-bridge service, so the whole lifecycle is unit-testable under node
 * (fake stream + fake executor), which the C4 scenarios never had directly.
 *
 * SPDX-License-Identifier: MIT
 ********************************************************************************/

import { inject, injectable } from '@theia/core/shared/inversify';
import { EngineClient } from 'soriku-engine-client-ext/lib/common/engine-client';
import { ChatStreamParams, SorikuSseEvent } from 'soriku-engine-client-ext/lib/common/engine-types';
import { AuthError, EngineError, StreamInterruptedError } from 'soriku-engine-client-ext/lib/common/engine-errors';
import { AssistantTurn, reduceSseEvent } from '../common/chat-model';

/** What the controller needs to execute tool events — the tools-bridge service satisfies this. */
export interface StreamToolExecutor {
    confirm(event: SorikuSseEvent): Promise<unknown>;
    executeDelegated(event: SorikuSseEvent): Promise<unknown>;
}

export interface StreamRunOptions {
    params: ChatStreamParams;
    /** The freshly-created assistant turn the stream folds events into. */
    initialTurn: AssistantTurn;
    /** Plan behaviour: never auto-execute; mark the turn planNeedsApproval. */
    needsApproval: boolean;
    /** Executes confirm_tool / tool_request events (fire-and-forget). */
    tools: StreamToolExecutor;
    /** Stop touching state the instant the host is torn down (#2). */
    isDisposed(): boolean;
    /** Called after every reduced event with the up-to-date turn (render + side-effects). */
    onTurn(turn: AssistantTurn, event: SorikuSseEvent): void;
}

@injectable()
export class ChatStreamController {

    @inject(EngineClient)
    protected readonly engineClient: EngineClient;

    protected abortController: AbortController | undefined;
    protected running = false;

    /** One stream at a time — mirrors the widget's old `streaming` flag. */
    get active(): boolean {
        return this.running;
    }

    /** Abort the in-flight stream (user Stop, agent switch, new chat, dispose). */
    abort(): void {
        this.abortController?.abort();
    }

    /**
     * Run one chat turn to completion. NEVER rejects: the returned turn carries
     * the outcome — done (incl. user stop), interrupted (retryable transport
     * drop), or error (engine failure / auth with authRequired set).
     */
    async run(options: StreamRunOptions): Promise<AssistantTurn> {
        let turn = options.initialTurn;
        this.abortController = new AbortController();
        this.running = true;
        try {
            const stream = this.engineClient.chatStream(options.params, this.abortController.signal);
            for await (const event of stream) {
                // Stop touching state the instant the widget is torn down (#2) — the
                // abort also ends the fetch, this just guarantees no mutation races it.
                if (options.isDisposed()) {
                    break;
                }
                turn = reduceSseEvent(turn, event);
                if (event.type === 'plan_awaiting_execution' && options.needsApproval) {
                    turn = { ...turn, planNeedsApproval: true };
                }
                if (event.type === 'confirm_tool') {
                    // Fire-and-forget: the engine blocks until /api/worker/confirm, then the stream
                    // resumes. Awaiting here would deadlock the loop waiting for the next event.
                    options.tools.confirm(event).catch(() => { /* default-deny already posted */ });
                } else if (event.type === 'tool_request') {
                    // Delegated tool: run it against the workspace, then POST the result. Same
                    // fire-and-forget reasoning — the engine blocks until the result arrives.
                    options.tools.executeDelegated(event).catch(() => { /* error result already posted */ });
                } else if (event.type === 'plan_awaiting_execution' && typeof event.plan_id === 'string') {
                    // Plan behaviour always waits for the user — engine auto_execute is for Auto/Edit.
                    const autoExecute = (event as { auto_execute?: boolean }).auto_execute;
                    const shouldRun = options.needsApproval ? false : autoExecute !== false;
                    if (shouldRun) {
                        this.engineClient.executePlan(event.plan_id).catch(() => { /* stream surfaces errors */ });
                    }
                }
                options.onTurn(turn, event);
            }
            if (turn.status === 'streaming') {
                turn = { ...turn, status: 'done' };
            }
        } catch (e) {
            // Typed error handling (#3/#5): an intentional stop is not a failure, and a
            // transport drop keeps the partial answer + a retry affordance — only real
            // engine-reported problems render as an error.
            if (e instanceof EngineError && e.code === 'aborted') {
                turn = { ...turn, status: 'done', phase: 'stopped' };
            } else if (e instanceof StreamInterruptedError) {
                turn = { ...turn, status: 'interrupted', error: (e as Error).message };
            } else if (e instanceof AuthError) {
                // #14: an auth failure is actionable, not a dead end — the render
                // offers sign-in (soriku.auth.connect) + retry.
                turn = { ...turn, status: 'error', authRequired: true, error: 'Authentication required — sign in and retry.' };
            } else {
                turn = { ...turn, status: 'error', error: (e as Error).message };
            }
        } finally {
            this.running = false;
            this.abortController = undefined;
        }
        return turn;
    }
}
