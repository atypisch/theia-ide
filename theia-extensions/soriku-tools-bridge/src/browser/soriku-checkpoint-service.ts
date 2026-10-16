/********************************************************************************
 * Soriku IDE — run checkpoints (Undo all / Keep / Restore, v2 chat).
 *
 * Remembers each file's content from BEFORE the first agent write of a run, so
 * the user can put the workspace back exactly. Persisted under
 * `.soriku/checkpoints/` in the workspace (git-ignored via `.soriku/.gitignore`).
 *
 * Safety: a checkpoint file on disk is DATA, never trusted. Before any restore
 * every path is re-checked to be inside the workspace, so a planted/edited
 * checkpoint cannot make Undo write or delete anything elsewhere.
 *
 * SPDX-License-Identifier: MIT
 ********************************************************************************/

import URI from '@theia/core/lib/common/uri';
import { Emitter, Event } from '@theia/core/lib/common';
import { inject, injectable } from '@theia/core/shared/inversify';
import { FileService } from '@theia/filesystem/lib/browser/file-service';
import { WorkspaceService } from '@theia/workspace/lib/browser/workspace-service';
import {
    Checkpoint, changedPaths, checkpointFileName, createCheckpoint, markKept, markUndone, parseCheckpoint, recordOriginal,
    serializeCheckpoint, undoActions,
} from '../common/checkpoint';
import { isPathWithinRoot } from '../common/tool-delegation';

const SORIKU_DIR = '.soriku';
const CHECKPOINT_DIR = 'checkpoints';
const SORIKU_GITIGNORE = 'checkpoints/\nguard.log\n';

export interface RestoreOutcome {
    restored: number;
    /** Paths refused because they resolve outside the workspace. */
    refused: string[];
    failed: string[];
}

@injectable()
export class SorikuCheckpointService {

    @inject(FileService)
    protected readonly fileService: FileService;

    @inject(WorkspaceService)
    protected readonly workspaceService: WorkspaceService;

    protected readonly runs = new Map<string, Checkpoint>();
    protected activeRunId: string | undefined;

    protected readonly onDidChangeEmitter = new Emitter<void>();
    readonly onDidChange: Event<void> = this.onDidChangeEmitter.event;

    /** Starts recording for a run; writes made by the agent after this are checkpointed. */
    beginRun(runId: string): void {
        this.runs.set(runId, createCheckpoint(runId));
        this.activeRunId = runId;
    }

    /** Stops recording (the run finished); the checkpoint stays available for Undo/Keep. */
    endRun(): void {
        this.activeRunId = undefined;
    }

    get(runId: string): Checkpoint | undefined {
        return this.runs.get(runId);
    }

    hasChanges(runId: string): boolean {
        const cp = this.runs.get(runId);
        return !!cp && changedPaths(cp).length > 0;
    }

    /** Called by the tool bridge right before it overwrites or patches a file. */
    async recordBeforeWrite(uri: URI): Promise<void> {
        const runId = this.activeRunId;
        const cp = runId ? this.runs.get(runId) : undefined;
        if (!runId || !cp || cp.state !== 'open') {
            return;
        }
        const key = uri.toString();
        if (Object.prototype.hasOwnProperty.call(cp.files, key)) {
            return;
        }
        let original: string | undefined;
        if (await this.fileService.exists(uri)) {
            original = (await this.fileService.read(uri)).value;
        }
        this.runs.set(runId, recordOriginal(this.runs.get(runId) ?? cp, key, original));
        await this.persist(runId);
        this.onDidChangeEmitter.fire();
    }

    /** Puts every touched file back as it was before the run. Safe to call on a `kept` checkpoint (= Restore). */
    async undo(runId: string): Promise<RestoreOutcome> {
        const cp = this.runs.get(runId) ?? await this.load(runId);
        if (!cp) {
            return { restored: 0, refused: [], failed: [] };
        }
        const root = (await this.workspaceService.roots)[0]?.resource;
        const outcome: RestoreOutcome = { restored: 0, refused: [], failed: [] };
        if (!root) {
            return outcome;
        }
        for (const action of undoActions(cp)) {
            const uri = new URI(action.path);
            if (!isPathWithinRoot(root.path.toString(), uri.path.toString())) {
                outcome.refused.push(action.path);
                continue;
            }
            try {
                if (action.kind === 'delete') {
                    if (await this.fileService.exists(uri)) {
                        await this.fileService.delete(uri);
                    }
                } else {
                    await this.fileService.write(uri, action.content);
                }
                outcome.restored++;
            } catch {
                outcome.failed.push(action.path);
            }
        }
        this.runs.set(runId, markUndone(cp));
        await this.persist(runId);
        this.onDidChangeEmitter.fire();
        return outcome;
    }

    /** The user accepted the run. The checkpoint is kept so it can still be restored. */
    async keep(runId: string): Promise<void> {
        const cp = this.runs.get(runId) ?? await this.load(runId);
        if (!cp) { return; }
        this.runs.set(runId, markKept(cp));
        await this.persist(runId);
        this.onDidChangeEmitter.fire();
    }

    protected async checkpointUri(runId: string): Promise<URI | undefined> {
        const root = (await this.workspaceService.roots)[0]?.resource;
        return root?.resolve(SORIKU_DIR).resolve(CHECKPOINT_DIR).resolve(checkpointFileName(runId));
    }

    protected async load(runId: string): Promise<Checkpoint | undefined> {
        try {
            const uri = await this.checkpointUri(runId);
            if (!uri || !await this.fileService.exists(uri)) { return undefined; }
            const cp = parseCheckpoint((await this.fileService.read(uri)).value);
            if (cp) { this.runs.set(runId, cp); }
            return cp;
        } catch {
            return undefined;
        }
    }

    /** Best-effort: a persistence hiccup must never block the agent's write. */
    protected async persist(runId: string): Promise<void> {
        try {
            const cp = this.runs.get(runId);
            const uri = await this.checkpointUri(runId);
            const root = (await this.workspaceService.roots)[0]?.resource;
            if (!cp || !uri || !root) { return; }
            const ignore = root.resolve(SORIKU_DIR).resolve('.gitignore');
            if (!await this.fileService.exists(ignore)) {
                await this.fileService.write(ignore, SORIKU_GITIGNORE);
            }
            await this.fileService.write(uri, serializeCheckpoint(cp));
        } catch {
            /* ignore */
        }
    }
}
