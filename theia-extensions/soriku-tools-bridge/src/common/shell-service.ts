/********************************************************************************
 * Soriku IDE — shell/search backend service protocol (pure, Theia-free)
 *
 * `shell_exec` and `project_search` used to run in the RENDERER via
 * `child_process`, which the production browser bundle polyfills with a stub
 * that throws on every call (esbuild `platform: 'browser'` — see
 * applications/electron/gen-esbuild.browser.mjs). This service moves both
 * onto the Theia BACKEND (a real Node process) over a JSON-RPC connection, the
 * same pattern @theia/filesystem uses for RemoteFileSystemServer.
 *
 * SPDX-License-Identifier: MIT
 ********************************************************************************/

export const SORIKU_SHELL_SERVICE_PATH = '/services/soriku-shell';

export const SorikuShellService = Symbol('SorikuShellService');

export const DEFAULT_SHELL_TIMEOUT_MS = 30_000;
export const MAX_SHELL_TIMEOUT_MS = 600_000;

export interface ShellExecOptions {
    command: string;
    cwd: string;
    /** Milliseconds; clamped to [1000, MAX_SHELL_TIMEOUT_MS]. Defaults to DEFAULT_SHELL_TIMEOUT_MS. */
    timeoutMs?: number;
}

export interface ShellExecResult {
    stdout: string;
    stderr: string;
    exitCode: number | null;
    timedOut: boolean;
}

export interface ShellJobStatus {
    jobId: string;
    running: boolean;
    exitCode: number | null;
    output: string;
    outputOffset: number;
}

export interface RipgrepHit {
    path: string;
    line: number;
    text: string;
}

export interface TreeEntry {
    path: string;
    isDirectory: boolean;
}

export interface SorikuShellService {
    exec(options: ShellExecOptions): Promise<ShellExecResult>;
    /** Starts a long-running command (e.g. a dev server) and returns immediately. */
    startJob(options: ShellExecOptions): Promise<{ jobId: string }>;
    /** Reads job output since `sinceOffset` (default 0) without blocking. */
    pollJob(jobId: string, sinceOffset?: number): Promise<ShellJobStatus>;
    stopJob(jobId: string): Promise<boolean>;
    search(pattern: string, baseDir: string, maxHits?: number): Promise<RipgrepHit[]>;
    listTree(baseDir: string, maxEntries?: number): Promise<TreeEntry[]>;
}

export function clampTimeoutMs(timeoutMs: number | undefined): number {
    if (typeof timeoutMs !== 'number' || !Number.isFinite(timeoutMs) || timeoutMs <= 0) {
        return DEFAULT_SHELL_TIMEOUT_MS;
    }
    return Math.min(Math.max(timeoutMs, 1000), MAX_SHELL_TIMEOUT_MS);
}

/**
 * Same allowlist as the engine's `ALLOWED_SHELL_COMMANDS`
 * (soriku/core/builtin_tools.py:31-43) — kept in lockstep so a command that's
 * blocked server-side is blocked here too, not laxer just because it's local.
 * The engine runs `shell=False` with argv-only execution (no shell
 * metacharacters); this service does the same (see splitShellCommand +
 * the node impl's `spawn(argv[0], argv.slice(1), { shell: false })`).
 */
export const ALLOWED_SHELL_COMMANDS: ReadonlySet<string> = new Set([
    'ls', 'pwd', 'echo', 'whoami', 'date',
    'python', 'python3', 'pytest',
    'git', 'rg', 'sed', 'awk', 'wc', 'sort', 'uniq', 'cut', 'tr',
    'npm', 'node',
    'ruff', 'mypy', 'tsc', 'eslint',
    'php', 'go', 'gofmt', 'cargo', 'clippy',
    'rubocop', 'shellcheck', 'bash',
    'clang-tidy', 'javac',
]);

/**
 * Minimal POSIX-ish tokenizer mirroring Python's `shlex.split` for the common
 * cases (single/double quotes, backslash escapes outside quotes). Pure, no
 * shell metacharacter interpretation — `&&`, `;`, `|`, `>` become literal
 * argv tokens, exactly like the engine's `shlex.split` + `shell=False`.
 */
export function splitShellCommand(command: string): string[] {
    const tokens: string[] = [];
    let current = '';
    let inSingle = false;
    let inDouble = false;
    let hasToken = false;
    for (let i = 0; i < command.length; i++) {
        const ch = command[i];
        if (inSingle) {
            if (ch === '\'') {
                inSingle = false;
            } else {
                current += ch;
            }
            continue;
        }
        if (inDouble) {
            if (ch === '"') {
                inDouble = false;
            } else if (ch === '\\' && i + 1 < command.length && (command[i + 1] === '"' || command[i + 1] === '\\')) {
                current += command[++i];
            } else {
                current += ch;
            }
            continue;
        }
        if (ch === '\'') {
            inSingle = true;
            hasToken = true;
        } else if (ch === '"') {
            inDouble = true;
            hasToken = true;
        } else if (ch === '\\' && i + 1 < command.length) {
            current += command[++i];
            hasToken = true;
        } else if (/\s/.test(ch)) {
            if (hasToken) {
                tokens.push(current);
                current = '';
                hasToken = false;
            }
        } else {
            current += ch;
            hasToken = true;
        }
    }
    if (hasToken) {
        tokens.push(current);
    }
    return tokens;
}

export interface CommandCheck {
    ok: boolean;
    reason?: string;
    argv?: string[];
}

/** Validates a command against ALLOWED_SHELL_COMMANDS the same way the engine does. */
export function checkShellCommand(command: string): CommandCheck {
    let argv: string[];
    try {
        argv = splitShellCommand(command);
    } catch (e) {
        return { ok: false, reason: `Invalid shell command: ${(e as Error).message}` };
    }
    if (argv.length === 0) {
        return { ok: false, reason: 'No command provided' };
    }
    if (!ALLOWED_SHELL_COMMANDS.has(argv[0])) {
        const allowed = [...ALLOWED_SHELL_COMMANDS].sort().join(', ');
        return { ok: false, reason: `BLOCKED: command '${argv[0]}' is not allowed. Allowed commands: ${allowed}` };
    }
    return { ok: true, argv };
}

/**
 * Mirror the ENGINE's shell_exec output shape byte-for-byte
 * (soriku/core/builtin_tools.py:206-219) so the agent loop sees an identical
 * string regardless of which side ran the command: stdout, then a
 * "\n[stderr]\n…" block when non-empty, then "\n[exit code: N]" when
 * non-zero, `.strip()`-ed, "(no output)" when empty, truncated at maxLen
 * with a trailing "\n[... truncated]" (no engine equivalent for
 * `timeoutSeconds` — the caller passes whatever timeout it actually used).
 */
export function formatShellResult(result: ShellExecResult, timeoutSeconds: number, maxLen = 10_000): string {
    if (result.timedOut) {
        return `TIMEOUT: command exceeded ${timeoutSeconds}s`;
    }
    let output = '';
    if (result.stdout) {
        output += result.stdout;
    }
    if (result.stderr) {
        output += `\n[stderr]\n${result.stderr}`;
    }
    if (result.exitCode !== null && result.exitCode !== 0) {
        output += `\n[exit code: ${result.exitCode}]`;
    }
    if (output.length > maxLen) {
        output = output.slice(0, maxLen) + '\n[... truncated]';
    }
    return output.trim() || '(no output)';
}

/**
 * Renders `listTree`'s flat, baseDir-relative entries as an indented tree
 * string for injection into chat context — so the model knows the workspace
 * layout up front instead of having to `list_directory` its way to it.
 * Indentation depth comes from path-separator count (works for both `/` and
 * `\` since Node's `path.relative` uses the host separator).
 */
export function formatTree(entries: TreeEntry[]): string {
    if (entries.length === 0) {
        return '(empty)';
    }
    return entries
        .map(entry => {
            const parts = entry.path.split(/[\\/]/);
            const depth = parts.length - 1;
            const name = parts[parts.length - 1];
            return `${'  '.repeat(depth)}${name}${entry.isDirectory ? '/' : ''}`;
        })
        .join('\n');
}
