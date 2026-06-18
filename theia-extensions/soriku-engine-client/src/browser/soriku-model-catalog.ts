/********************************************************************************
 * Soriku IDE — model catalog change events
 *
 * A tiny shared bus so views that change the installed models / providers
 * (the Manage Models view) can tell views that list them (the chat model
 * pickers) to reload live, without a hard dependency between those extensions.
 *
 * SPDX-License-Identifier: MIT
 ********************************************************************************/

import { injectable } from '@theia/core/shared/inversify';
import { Emitter, Event } from '@theia/core/lib/common';

@injectable()
export class SorikuModelCatalog {

    protected readonly onDidChangeEmitter = new Emitter<void>();
    /** Fires after a model is pulled/deleted/(de)activated or a provider is added/removed. */
    readonly onDidChange: Event<void> = this.onDidChangeEmitter.event;

    /** Notify listeners that the installed-model or provider set changed. */
    notifyChanged(): void {
        this.onDidChangeEmitter.fire();
    }
}
