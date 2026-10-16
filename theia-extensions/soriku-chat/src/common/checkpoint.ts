/********************************************************************************
 * Soriku IDE — run checkpoints: pure model behind Undo all / Keep / Restore (v2)
 *
 * SPDX-License-Identifier: MIT
 ********************************************************************************/

/**
 * A checkpoint remembers each file's content from BEFORE the first agent write
 * of a run, so "Undo all" can put the workspace back exactly. File IO lives in
 * the browser layer; everything here is plain data so it is unit-testable.
 *
 * An `{ absent: true }` entry means the file did not exist yet — undoing deletes it.
 * (An explicit marker rather than null: it survives JSON and reads unambiguously.)
 */
export type OriginalFile = { content: string } | { absent: true };

export interface Checkpoint {
    runId: string;
    createdAt: string;
    /** Absolute or workspace-relative path → what the file was before the run. */
    files: Record<string, OriginalFile>;
    /** `kept` = user accepted the run; the checkpoint stays for Restore. */
    state: 'open' | 'undone' | 'kept';
}

export type RestoreAction =
    | { kind: 'write'; path: string; content: string }
    | { kind: 'delete'; path: string };

export function createCheckpoint(runId: string, now: Date = new Date()): Checkpoint {
    return { runId, createdAt: now.toISOString(), files: {}, state: 'open' };
}

/** Records a file's pre-run content. Only the FIRST record per path counts (later writes must not overwrite the true original). */
export function recordOriginal(cp: Checkpoint, path: string, original: string | undefined): Checkpoint {
    if (Object.prototype.hasOwnProperty.call(cp.files, path)) { return cp; }
    return { ...cp, files: { ...cp.files, [path]: original === undefined ? { absent: true } : { content: original } } };
}

/** The writes/deletes that put every touched file back to its original state. */
export function undoActions(cp: Checkpoint): RestoreAction[] {
    return Object.entries(cp.files).map(([path, original]): RestoreAction =>
        'absent' in original ? { kind: 'delete', path } : { kind: 'write', path, content: original.content });
}

export function markUndone(cp: Checkpoint): Checkpoint { return { ...cp, state: 'undone' }; }
export function markKept(cp: Checkpoint): Checkpoint { return { ...cp, state: 'kept' }; }

export function changedPaths(cp: Checkpoint): string[] { return Object.keys(cp.files); }

export function serializeCheckpoint(cp: Checkpoint): string { return JSON.stringify(cp, undefined, 2); }

/** Parses a stored checkpoint; returns undefined for anything malformed (never throws). */
export function parseCheckpoint(text: string): Checkpoint | undefined {
    try {
        const v = JSON.parse(text);
        if (typeof v !== 'object' || !v || typeof v.runId !== 'string' || typeof v.files !== 'object' || !v.files) { return undefined; }
        if (!['open', 'undone', 'kept'].includes(v.state)) { return undefined; }
        for (const f of Object.values(v.files) as unknown[]) {
            const e = f as { absent?: unknown; content?: unknown } | undefined;
            const valid = typeof e === 'object' && e !== undefined && (e.absent === true || typeof e.content === 'string');
            if (!valid || e === undefined) { return undefined; }
        }
        return v as Checkpoint;
    } catch {
        return undefined;
    }
}

/** Run ids become file names — keep them to a safe charset so a hostile id can't escape `.soriku/checkpoints/`. */
export function checkpointFileName(runId: string): string {
    return `${runId.replace(/[^A-Za-z0-9_-]/g, '_').slice(0, 80) || 'run'}.json`;
}
