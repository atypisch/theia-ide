/********************************************************************************
 * Soriku IDE — inline tool approval (chat UI, Cursor-style)
 *
 * Replaces modal ConfirmDialog with an inline banner in Soriku Chat. Backed by a
 * FIFO ApprovalQueue so concurrent workers' confirmations queue (one banner at a
 * time, in order) instead of silently auto-denying earlier ones (#10), and an
 * unanswered confirmation auto-denies on a timeout so the engine stream can never
 * deadlock (#1). `cancelAll()` flushes on agent switch / widget dispose (#1/#16).
 *
 * SPDX-License-Identifier: MIT
 ********************************************************************************/

import { injectable } from '@theia/core/shared/inversify';
import { ToolConfirmationView } from '../common/tool-confirmation';
import { ApprovalQueue } from '../common/approval-queue';

export interface PendingToolApproval {
    confirmationId: string;
    tool: string;
    view: ToolConfirmationView;
}

export type ApprovalDecision = { approved: boolean; rememberSession: boolean };

const DENIED: ApprovalDecision = { approved: false, rememberSession: false };

@injectable()
export class SorikuToolApprovalBridge {

    protected listeners = new Set<() => void>();

    /** Optional hook (set by the widget) to surface an auto-deny notice to the user. */
    onAutoDeny?: (payload: PendingToolApproval) => void;

    protected readonly queue = new ApprovalQueue<PendingToolApproval, ApprovalDecision>({
        denied: () => DENIED,
        onChange: () => this.notify(),
        onAutoDeny: payload => this.onAutoDeny?.(payload as PendingToolApproval),
    });

    /** The approval currently shown in the banner (queue head), or undefined. */
    get pending(): PendingToolApproval | undefined {
        return this.queue.head;
    }

    /** How many approvals are waiting (for a "+N more" badge). */
    get pendingCount(): number {
        return this.queue.count;
    }

    onPendingChange(listener: () => void): () => void {
        this.listeners.add(listener);
        return () => this.listeners.delete(listener);
    }

    protected notify(): void {
        this.listeners.forEach(fn => fn());
    }

    /** Block until the user answers in chat, or the approval auto-denies/flushes. */
    prompt(confirmationId: string, tool: string, view: ToolConfirmationView): Promise<ApprovalDecision> {
        return new Promise(resolve => {
            this.queue.enqueue({ confirmationId, tool, view }, resolve);
        });
    }

    /** Answer the currently shown approval. */
    respond(approved: boolean, rememberSession: boolean): void {
        this.queue.respond({ approved, rememberSession });
    }

    /** Deny + drop the currently shown approval (user dismissed the banner). */
    cancelPending(): void {
        this.queue.cancelHead();
    }

    /** Deny + drop ALL queued approvals — agent switch / widget dispose (#1/#16). */
    cancelAll(): void {
        this.queue.cancelAll();
    }
}
