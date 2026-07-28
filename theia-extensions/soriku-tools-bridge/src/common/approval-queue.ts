/********************************************************************************
 * Soriku IDE — tool-approval FIFO queue (pure, Theia-free, unit-testable)
 *
 * Fixes the single-slot approval model that (a) auto-denied earlier confirmations
 * when a new one arrived (#10) and (b) could leave a forgotten confirmation pending
 * forever, deadlocking the engine stream (#1). This queue shows one approval at a
 * time in arrival order, auto-denies any approval that is never answered within a
 * timeout, and can flush everything (agent switch / widget dispose — #1/#16).
 *
 * SPDX-License-Identifier: MIT
 ********************************************************************************/

export interface QueuedApproval<P, D> {
    payload: P;
    resolve: (decision: D) => void;
    timer?: ReturnType<typeof setTimeout>;
}

export interface ApprovalQueueOptions<D> {
    /** The decision produced on deny / auto-deny / flush. */
    denied: () => D;
    /** Called whenever the head or count changes (so the UI re-renders). */
    onChange: () => void;
    /** Auto-deny an unanswered approval after this many ms (default 5 min). */
    timeoutMs?: number;
    /** Notified when an approval is auto-denied by timeout (for a user notice). */
    onAutoDeny?: (payload: unknown) => void;
    /** Injectable timers so tests can use fakes. */
    setTimer?: (fn: () => void, ms: number) => ReturnType<typeof setTimeout>;
    clearTimer?: (t: ReturnType<typeof setTimeout>) => void;
}

export class ApprovalQueue<P, D> {
    static readonly DEFAULT_TIMEOUT_MS = 5 * 60 * 1000;

    private queue: QueuedApproval<P, D>[] = [];
    private readonly denied: () => D;
    private readonly onChange: () => void;
    /** 0 = never auto-deny (a long unattended autonomous run). Mutable via {@link setTimeoutMs}. */
    private timeoutMs: number;
    private readonly onAutoDeny?: (payload: unknown) => void;
    private readonly setTimer: (fn: () => void, ms: number) => ReturnType<typeof setTimeout>;
    private readonly clearTimer: (t: ReturnType<typeof setTimeout>) => void;

    constructor(opts: ApprovalQueueOptions<D>) {
        this.denied = opts.denied;
        this.onChange = opts.onChange;
        this.timeoutMs = opts.timeoutMs ?? ApprovalQueue.DEFAULT_TIMEOUT_MS;
        this.onAutoDeny = opts.onAutoDeny;
        this.setTimer = opts.setTimer ?? ((fn, ms) => setTimeout(fn, ms));
        this.clearTimer = opts.clearTimer ?? (t => clearTimeout(t));
    }

    /** The approval currently shown (queue head), or undefined. */
    get head(): P | undefined {
        return this.queue[0]?.payload;
    }

    get count(): number {
        return this.queue.length;
    }

    /**
     * Change the auto-deny timeout (e.g. from a live preference change).
     * Only affects approvals enqueued AFTER this call — an already-queued
     * approval keeps the timer it was given.
     */
    setTimeoutMs(timeoutMs: number): void {
        this.timeoutMs = timeoutMs;
    }

    /** Enqueue an approval; resolves when answered/auto-denied/flushed. 0 timeout = never auto-deny. */
    enqueue(payload: P, resolve: (decision: D) => void): void {
        const item: QueuedApproval<P, D> = { payload, resolve };
        if (this.timeoutMs > 0) {
            item.timer = this.setTimer(() => this.expire(item), this.timeoutMs);
        }
        this.queue.push(item);
        this.onChange();
    }

    /** Answer the currently shown approval (head) and advance to the next. */
    respond(decision: D): void {
        const item = this.queue.shift();
        if (!item) {
            return;
        }
        this.settle(item, decision);
        this.onChange();
    }

    /** Deny + drop the head only (e.g. the user dismissed the banner). */
    cancelHead(): void {
        const item = this.queue.shift();
        if (!item) {
            return;
        }
        this.settle(item, this.denied());
        this.onChange();
    }

    /** Deny + drop EVERY queued approval (agent switch / widget dispose). */
    cancelAll(): void {
        if (!this.queue.length) {
            return;
        }
        const all = this.queue;
        this.queue = [];
        for (const item of all) {
            this.settle(item, this.denied());
        }
        this.onChange();
    }

    private expire(item: QueuedApproval<P, D>): void {
        const i = this.queue.indexOf(item);
        if (i < 0) {
            return;
        }
        this.queue.splice(i, 1);
        this.settle(item, this.denied());
        this.onAutoDeny?.(item.payload);
        this.onChange();
    }

    private settle(item: QueuedApproval<P, D>, decision: D): void {
        if (item.timer !== undefined) {
            this.clearTimer(item.timer);
        }
        item.resolve(decision);
    }
}
