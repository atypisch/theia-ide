/********************************************************************************
 * Soriku IDE — global toast notifications, 1:1 from the mockup's bottom-center
 * pill (`state.toast` / `clearToast`). Lives in soriku-theme-ext since every
 * other soriku-* extension already depends on it — no new cross-extension
 * coupling needed to show a toast from anywhere.
 *
 * SPDX-License-Identifier: MIT
 ********************************************************************************/

import { injectable } from '@theia/core/shared/inversify';
import { Emitter, Event } from '@theia/core/lib/common';

/** How long a toast stays up before auto-dismissing (the mockup itself never auto-dismisses — click-only — but a silent permanent pill is poor UX for a real app). */
const DEFAULT_DURATION_MS = 4000;

@injectable()
export class SorikuToastService {

    protected message: string | undefined;
    protected dismissTimer: ReturnType<typeof setTimeout> | undefined;

    protected readonly onDidChangeEmitter = new Emitter<string | undefined>();
    readonly onDidChange: Event<string | undefined> = this.onDidChangeEmitter.event;

    show(message: string, durationMs = DEFAULT_DURATION_MS): void {
        this.message = message;
        this.onDidChangeEmitter.fire(this.message);
        this.scheduleDismiss(durationMs);
    }

    dismiss(): void {
        this.message = undefined;
        this.onDidChangeEmitter.fire(undefined);
        this.clearTimer();
    }

    getMessage(): string | undefined {
        return this.message;
    }

    protected scheduleDismiss(durationMs: number): void {
        this.clearTimer();
        this.dismissTimer = setTimeout(() => this.dismiss(), durationMs);
    }

    protected clearTimer(): void {
        if (this.dismissTimer !== undefined) {
            clearTimeout(this.dismissTimer);
            this.dismissTimer = undefined;
        }
    }
}
