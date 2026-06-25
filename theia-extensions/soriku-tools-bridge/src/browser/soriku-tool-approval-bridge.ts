/********************************************************************************
 * Soriku IDE — inline tool approval (chat UI, Cursor-style)
 *
 * Replaces modal ConfirmDialog with an inline banner in Soriku Chat.
 *
 * SPDX-License-Identifier: MIT
 ********************************************************************************/

import { injectable } from '@theia/core/shared/inversify';
import { ToolConfirmationView } from '../common/tool-confirmation';

export interface PendingToolApproval {
    confirmationId: string;
    tool: string;
    view: ToolConfirmationView;
    resolve: (decision: { approved: boolean; rememberSession: boolean }) => void;
}

@injectable()
export class SorikuToolApprovalBridge {

    pending: PendingToolApproval | undefined;

    protected listeners = new Set<() => void>();

    onPendingChange(listener: () => void): () => void {
        this.listeners.add(listener);
        return () => this.listeners.delete(listener);
    }

    protected notify(): void {
        this.listeners.forEach(fn => fn());
    }

    /** Block until the user approves/denies in chat (or caller auto-resolves). */
    prompt(
        confirmationId: string,
        tool: string,
        view: ToolConfirmationView,
    ): Promise<{ approved: boolean; rememberSession: boolean }> {
        if (this.pending) {
            this.pending.resolve({ approved: false, rememberSession: false });
            this.pending = undefined;
        }
        return new Promise(resolve => {
            this.pending = { confirmationId, tool, view, resolve };
            this.notify();
        });
    }

    respond(approved: boolean, rememberSession: boolean): void {
        const current = this.pending;
        if (!current) {
            return;
        }
        this.pending = undefined;
        current.resolve({ approved, rememberSession });
        this.notify();
    }

    cancelPending(): void {
        if (this.pending) {
            this.pending.resolve({ approved: false, rememberSession: false });
            this.pending = undefined;
            this.notify();
        }
    }
}
