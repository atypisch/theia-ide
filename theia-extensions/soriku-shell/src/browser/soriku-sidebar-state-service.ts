/********************************************************************************
 * Soriku IDE — sidebar rail (minimized/full) state, 1:1 from the mockup's
 * `sideMin` flag. Hidden/shown is a separate concern owned by
 * SorikuSidebarContribution (Widget#hide()/show()); this service only tracks
 * whether the sidebar, while shown, renders as the full 246px column or the
 * 52px icon rail.
 *
 * SPDX-License-Identifier: MIT
 ********************************************************************************/

import { inject, injectable, postConstruct } from '@theia/core/shared/inversify';
import { Emitter, Event } from '@theia/core/lib/common';
import { StorageService } from '@theia/core/lib/browser/storage-service';

const RAIL_STORAGE_KEY = 'soriku.sidebar.rail';

@injectable()
export class SorikuSidebarStateService {

    @inject(StorageService)
    protected readonly storage: StorageService;

    protected rail = false;

    protected readonly onDidChangeEmitter = new Emitter<boolean>();
    /** Fires with the new rail state whenever it changes. */
    readonly onDidChange: Event<boolean> = this.onDidChangeEmitter.event;

    @postConstruct()
    protected init(): void {
        // Fire-and-forget: an async postConstruct makes Inversify treat this
        // service as an async dependency, which breaks any synchronously-
        // resolved consumer (e.g. KeybindingContribution — confirmed this
        // session: "constructing KeybindingContribution in a synchronous way
        // but it has asynchronous dependencies"). The widget already renders
        // once with the rail=false default before this resolves, same as its
        // other async-loaded initial state (e.g. the workspace icon).
        this.storage.getData<boolean>(RAIL_STORAGE_KEY, false).then(rail => {
            this.rail = rail;
            this.onDidChangeEmitter.fire(rail);
        });
    }

    get isRail(): boolean {
        return this.rail;
    }

    toggleRail(): void {
        this.setRail(!this.rail);
    }

    protected setRail(rail: boolean): void {
        this.rail = rail;
        this.onDidChangeEmitter.fire(rail);
        this.storage.setData(RAIL_STORAGE_KEY, rail).catch(() => { /* best-effort */ });
    }
}
