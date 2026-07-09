/********************************************************************************
 * Soriku IDE — session-scoped tracker of line-diff stats for files the agent
 * fleet has written this session, keyed by absolute path. Fed by
 * SorikuToolConfirmationService.runTool() right after a real write; read by
 * the chat dock's generated-files DiffBar.
 *
 * SPDX-License-Identifier: MIT
 ********************************************************************************/

import { injectable } from '@theia/core/shared/inversify';
import { Emitter, Event } from '@theia/core/lib/common';
import { LineDiffStats } from '../common/tool-delegation';

@injectable()
export class SorikuGeneratedFilesTracker {

    protected readonly stats = new Map<string, LineDiffStats>();
    protected readonly onDidChangeEmitter = new Emitter<string>();
    readonly onDidChange: Event<string> = this.onDidChangeEmitter.event;

    record(path: string, diff: LineDiffStats): void {
        this.stats.set(path, diff);
        this.onDidChangeEmitter.fire(path);
    }

    get(path: string): LineDiffStats | undefined {
        return this.stats.get(path);
    }

    /** All files written this session, most-recently-recorded first (for the Explorer sidebar's "Generated · run" section). */
    entries(): Array<[string, LineDiffStats]> {
        return Array.from(this.stats.entries()).reverse();
    }
}
