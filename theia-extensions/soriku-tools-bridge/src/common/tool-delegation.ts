/********************************************************************************
 * Soriku IDE — client-side tool delegation model (pure, Theia-free, testable)
 *
 * When the IDE sends `client_tools`, the engine emits `tool_request` SSE events
 * and waits for the IDE to execute the tool against its workspace and POST the
 * result. This module parses those events and shapes results to match the
 * engine's own tool output (so the agent loop sees identical strings).
 *
 * SPDX-License-Identifier: MIT
 ********************************************************************************/

import { SorikuSseEvent, ToolExecResult } from 'soriku-engine-client-ext/lib/common/engine-types';
import { splitShellCommand } from './shell-service';

export interface ToolRequest {
    requestId: string;
    tool: string;
    args: Record<string, unknown>;
    iteration?: number;
}

/**
 * Tools the IDE executes itself against the open workspace. Sent to the engine
 * as `client_tools`; everything else stays server-side. `shell_exec` and
 * `project_search` run on the Theia BACKEND (a real Node process, see
 * ../node/soriku-shell-service-impl.ts) via SorikuShellService, not in this
 * renderer — `child_process` here would hit the browser-bundle polyfill and
 * throw on every call. `shell_job_status`/`shell_job_stop` poll/stop a
 * background job started by `shell_exec({background:true})` (e.g. a dev server).
 */
export const DELEGATED_TOOLS: readonly string[] = [
    'file_read', 'file_write', 'list_directory', 'apply_patch', 'project_search', 'shell_exec',
    'shell_job_status', 'shell_job_stop',
];

/** Extract a delegated tool request from a `tool_request` SSE event, or undefined if malformed. */
export function parseToolRequestEvent(event: SorikuSseEvent): ToolRequest | undefined {
    if (event.type !== 'tool_request') {
        return undefined;
    }
    const requestId = typeof event.request_id === 'string' ? event.request_id : undefined;
    const tool = typeof event.tool === 'string' ? event.tool : undefined;
    if (!requestId || !tool) {
        return undefined;
    }
    const args = event.args && typeof event.args === 'object' ? event.args as Record<string, unknown> : {};
    return { requestId, tool, args, iteration: typeof event.iteration === 'number' ? event.iteration : undefined };
}

export function getStringArg(args: Record<string, unknown>, key: string): string | undefined {
    const value = args[key];
    return typeof value === 'string' ? value : undefined;
}

export function getNumberArg(args: Record<string, unknown>, key: string): number | undefined {
    const value = args[key];
    return typeof value === 'number' ? value : undefined;
}

export function getBooleanArg(args: Record<string, unknown>, key: string): boolean | undefined {
    const value = args[key];
    return typeof value === 'boolean' ? value : undefined;
}

/** Mirror the engine `list_directory` output: "d name" / "f name", alpha-sorted, capped at 100. */
export function formatDirectoryListing(entries: { name: string; isDirectory: boolean }[]): string {
    const sorted = [...entries].sort((a, b) => a.name.localeCompare(b.name));
    const lines = sorted.slice(0, 100).map(e => `${e.isDirectory ? 'd ' : 'f '}${e.name}`);
    if (sorted.length > 100) {
        lines.push(`... and ${sorted.length - 100} more`);
    }
    return lines.length > 0 ? lines.join('\n') : '(empty directory)';
}

/** Mirror the engine `file_write` JSON result so the loop's file-metadata extraction works. */
export function formatWriteResult(absolutePath: string, filename: string, size: number): string {
    return JSON.stringify({ written: absolutePath, filename, size });
}

/** Mirror the engine `file_read` line cap. */
export function truncateToMaxLines(content: string, maxLines = 200): string {
    const lines = content.split('\n');
    if (lines.length > maxLines) {
        return lines.slice(0, maxLines).join('\n') + `\n\n[... truncated, ${lines.length - maxLines} more lines]`;
    }
    return content;
}

/** How a tool `path` arg resolves against the workspace root. */
export type PathKind = 'root' | 'absolute' | 'relative';

export function pathKind(path: string): PathKind {
    if (!path || !path.trim()) {
        return 'root';
    }
    return path.startsWith('/') ? 'absolute' : 'relative';
}

/** Normalize a POSIX path — resolve `.`/`..`, collapse empty segments. Pure, no FS. */
export function normalizePosixPath(path: string): string {
    const out: string[] = [];
    for (const seg of path.split('/')) {
        if (seg === '' || seg === '.') {
            continue;
        }
        if (seg === '..') {
            out.pop();
            continue;
        }
        out.push(seg);
    }
    return '/' + out.join('/');
}

/**
 * True when `candidate` is the workspace root itself or a descendant of it, after
 * normalizing away `..`/`.` — the containment check that keeps tool paths inside the
 * workspace (rejects `/etc/passwd`, `../../x`, etc.). See {@link isPathWithinRoot} #11.
 */
export function isPathWithinRoot(rootPath: string, candidate: string): boolean {
    const root = normalizePosixPath(rootPath);
    const cand = normalizePosixPath(candidate);
    if (cand === root) {
        return true;
    }
    return cand.startsWith(root === '/' ? '/' : root + '/');
}

/**
 * Key for the session "allow always" set (#12). `shell_exec` is remembered by its
 * exact normalized command so remembering never green-lights a *different* command;
 * every other tool is remembered by name (their args are reviewed elsewhere).
 */
export function sessionAllowKey(tool: string, args: unknown): string {
    if (tool === 'shell_exec') {
        const bag = (args && typeof args === 'object') ? args as Record<string, unknown> : {};
        const cmd = (getStringArg(bag, 'command') ?? getStringArg(bag, 'cmd') ?? '').trim().replace(/\s+/g, ' ');
        return `shell_exec\n${cmd}`;
    }
    return tool;
}

export function okResult(result: string): ToolExecResult {
    return { result };
}

/**
 * Commands that keep asking even under `autoApprove: 'safe'` (Phase 2) — the
 * user still has to type "all" (full YOLO) to skip these. Most classic
 * dangerous binaries (`rm`, `sudo`, `chmod`, `dd`, `mkfs`, `curl`) aren't even
 * in ALLOWED_SHELL_COMMANDS (see shell-service.ts) so they're already hard-
 * blocked outright; this list exists for (a) the allowlisted commands whose
 * OWN semantics are destructive (`git push`, `git reset --hard`, `git clean`)
 * and (b) `bash`/`sh -c` — the one escape hatch that defeats the argv-only
 * exec model, since bash *itself* becomes a shell interpreter once it runs.
 */
export function isDangerousShellCommand(command: string): boolean {
    const argv = splitShellCommand(command);
    if (argv.length === 0) {
        return false;
    }
    const [bin, ...rest] = argv;
    if ((bin === 'bash' || bin === 'sh' || bin === 'zsh') && rest.includes('-c')) {
        return true;
    }
    if (bin === 'git') {
        const sub = rest[0];
        if (sub === 'push') {
            return true;
        }
        if (sub === 'reset' && rest.includes('--hard')) {
            return true;
        }
        if (sub === 'clean') {
            return true;
        }
    }
    // Defense in depth for a future allowlist change, not reachable today —
    // none of these binaries are in ALLOWED_SHELL_COMMANDS yet.
    if (['rm', 'rmdir', 'sudo', 'mkfs', 'dd'].includes(bin)) {
        return true;
    }
    if ((bin === 'chmod' || bin === 'chown') && rest.some(a => /^-\w*[rR]\w*$/.test(a) || a === '--recursive')) {
        return true;
    }
    return false;
}

/**
 * Apply a unified-diff patch (single-file, @@ hunks) — STRICT (audit C-D).
 *
 * The previous implementation applied deletions/insertions at the header's line
 * numbers without ever checking that context or deleted lines matched the
 * original: an offset hunk (file changed since the diff was made) silently
 * corrupted the file. Now every context (' ') and deletion ('-') line is
 * validated against the original; any mismatch throws with the line number —
 * the delegation layer turns that into an explicit error result, so the engine
 * sees a loud failure it can re-patch from, never a silent mis-patch.
 */
export function applyUnifiedPatch(original: string, patch: string): string {
    const lines = original.split('\n');
    const patchLines = patch.split('\n');
    const out: string[] = [];
    let src = 0;          // next unconsumed line of the original (0-based)
    let sawHunk = false;
    let i = 0;
    while (i < patchLines.length) {
        const header = patchLines[i];
        if (!header.startsWith('@@')) {
            i++;          // file headers (---/+++), index lines, prose — skip
            continue;
        }
        const match = /^@@ -(\d+)(?:,(\d+))? \+\d+(?:,\d+)? @@/.exec(header);
        if (!match) {
            throw new Error(`Invalid patch hunk header: ${header}`);
        }
        sawHunk = true;
        // A "-0,0" start means insertion into an empty region before line 1.
        const hunkStart = Math.max(0, parseInt(match[1], 10) - 1);
        if (hunkStart < src) {
            throw new Error(`Overlapping or out-of-order hunks at line ${hunkStart + 1}`);
        }
        if (hunkStart > lines.length) {
            throw new Error(`Hunk starts at line ${hunkStart + 1}, beyond end of file (${lines.length} lines)`);
        }
        while (src < hunkStart) {
            out.push(lines[src++]);
        }
        i++;
        while (i < patchLines.length && !patchLines[i].startsWith('@@')) {
            const pl = patchLines[i];
            if (pl.startsWith('+')) {
                out.push(pl.slice(1));
            } else if (pl.startsWith(' ') || pl === '') {
                // '' tolerates producers that drop the leading space on empty context lines.
                const expected = pl === '' ? '' : pl.slice(1);
                if (lines[src] !== expected) {
                    throw new Error(`Patch context mismatch at line ${src + 1}: expected ${JSON.stringify(expected)}, file has ${JSON.stringify(lines[src] ?? '<end of file>')}`);
                }
                out.push(lines[src++]);
            } else if (pl.startsWith('-')) {
                const expected = pl.slice(1);
                if (lines[src] !== expected) {
                    throw new Error(`Patch deletion mismatch at line ${src + 1}: expected ${JSON.stringify(expected)}, file has ${JSON.stringify(lines[src] ?? '<end of file>')}`);
                }
                src++;    // consumed, not copied — deleted
            } else if (pl.startsWith('\\')) {
                // "\ No newline at end of file" — metadata, not content.
            } else {
                throw new Error(`Unrecognized patch line: ${JSON.stringify(pl)}`);
            }
            i++;
        }
    }
    if (!sawHunk) {
        throw new Error('Patch contains no @@ hunks');
    }
    while (src < lines.length) {
        out.push(lines[src++]);
    }
    return out.join('\n');
}

export interface LineDiffStats {
    added: number;
    removed: number;
}

/**
 * Simple line-based diff stat (added/removed counts) for the chat DiffBar —
 * an LCS-length line diff, not a full Myers diff. Capped at 4000 lines per
 * side so a huge generated file can't make this O(n*m) DP blow up; beyond
 * that the caller should treat the stats as unavailable rather than wait.
 */
export function computeLineDiffStats(before: string, after: string): LineDiffStats | undefined {
    // ''.split('\n') is ['' ] — one phantom empty "line" — which would
    // otherwise count a brand-new file as "+N -1" and an emptied file as
    // "+1 -N" instead of the expected "+N -0" / "+0 -N".
    const a = before === '' ? [] : before.split('\n');
    const b = after === '' ? [] : after.split('\n');
    if (a.length > 4000 || b.length > 4000) {
        return undefined;
    }
    const dp: number[][] = Array.from({ length: a.length + 1 }, () => new Array<number>(b.length + 1).fill(0));
    for (let i = a.length - 1; i >= 0; i--) {
        for (let j = b.length - 1; j >= 0; j--) {
            dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
        }
    }
    const lcs = dp[0][0];
    return { added: b.length - lcs, removed: a.length - lcs };
}

/** Format project_search hits like the engine tool. */
export function formatSearchResults(hits: { path: string; line: number; text: string }[], capped = 50): string {
    if (hits.length === 0) {
        return '(no matches)';
    }
    const shown = hits.slice(0, capped);
    const body = shown.map(h => `${h.path}:${h.line}: ${h.text}`).join('\n');
    return hits.length > capped ? `${body}\n... and ${hits.length - capped} more` : body;
}

export function errorResult(error: string): ToolExecResult {
    return { error };
}

/**
 * Cumulative reveal frames for the live-growing diff (Fase 1B). Splits `content`
 * into up to `maxFrames` cumulative prefixes ending at the full content, so a
 * diff editor can grow the proposed file "typewriter"-style. Reveals by line so
 * code appears in readable chunks; an empty leading frame starts from blank.
 */
export function progressiveRevealFrames(content: string, maxFrames = 24): string[] {
    if (!content) {
        return [''];
    }
    const lines = content.split('\n');
    const total = lines.length;
    const step = Math.max(1, Math.ceil(total / Math.max(1, maxFrames)));
    const frames: string[] = [''];
    for (let upto = step; upto < total; upto += step) {
        frames.push(lines.slice(0, upto).join('\n'));
    }
    frames.push(content); // always end on the complete content
    return frames;
}
