/********************************************************************************
 * Soriku IDE — global overlay state (Keyboard shortcuts, New window, …),
 * 1:1 from the mockup's root-level `overlayOpen`/`closeOverlay` state.
 *
 * SPDX-License-Identifier: MIT
 ********************************************************************************/

import { injectable } from '@theia/core/shared/inversify';
import { Emitter, Event } from '@theia/core/lib/common';

export type SorikuOverlayKind = 'shortcuts' | 'new-window';

@injectable()
export class SorikuOverlayService {

    protected kind: SorikuOverlayKind | undefined;

    protected readonly onDidChangeEmitter = new Emitter<SorikuOverlayKind | undefined>();
    readonly onDidChange: Event<SorikuOverlayKind | undefined> = this.onDidChangeEmitter.event;

    open(kind: SorikuOverlayKind): void {
        this.kind = kind;
        this.onDidChangeEmitter.fire(this.kind);
    }

    close(): void {
        this.kind = undefined;
        this.onDidChangeEmitter.fire(this.kind);
    }

    getKind(): SorikuOverlayKind | undefined {
        return this.kind;
    }
}
