/********************************************************************************
 * Soriku IDE — soriku-guard policy (pure).
 *
 * One rule set, two entrances: the IDE evaluates every delegated tool call with it
 * BEFORE running anything, and the `soriku-guard` MCP server exposes the same checks
 * to agents and to the engine. Written for the incident in CLAUDE.md: an injected
 * workflow/task/script that steals secrets.
 *
 * Verdicts:
 *   deny    — never runs, no override (not "Always allow", not soriku.md, not a preference)
 *   confirm — always asks the user, even with auto-approve "all"
 *   allow   — runs under the normal approval settings
 *
 * Secrets are never echoed: findings carry a rule id, never the matched value.
 *
 * SPDX-License-Identifier: MIT
 ********************************************************************************/

/* eslint-disable max-len -- the rule tables are one regex or one user-facing sentence per line, and wrapping them hurts readability */
import { isPathWithinRoot, normalizePosixPath } from './tool-delegation';
import { splitShellCommand } from './shell-service';

export type GuardVerdict = 'allow' | 'confirm' | 'deny';

export interface GuardDecision {
    verdict: GuardVerdict;
    /** Stable rule id for the audit log, e.g. `path-outside-workspace`. */
    rule: string;
    /** Human reasons shown in the chat step and the approval card. */
    reasons: string[];
}

export const ALLOW: GuardDecision = { verdict: 'allow', rule: 'ok', reasons: [] };

const RANK: Record<GuardVerdict, number> = { allow: 0, confirm: 1, deny: 2 };

/** The stricter of two decisions (reasons of equal-rank decisions are merged). */
export function stricter(a: GuardDecision, b: GuardDecision): GuardDecision {
    if (RANK[a.verdict] !== RANK[b.verdict]) { return RANK[a.verdict] > RANK[b.verdict] ? a : b; }
    return a.verdict === 'allow' ? a : { verdict: a.verdict, rule: a.rule, reasons: [...a.reasons, ...b.reasons.filter(r => !a.reasons.includes(r))] };
}

const deny = (rule: string, reason: string): GuardDecision => ({ verdict: 'deny', rule, reasons: [reason] });
const confirm = (rule: string, reason: string): GuardDecision => ({ verdict: 'confirm', rule, reasons: [reason] });

// ── secrets ────────────────────────────────────────────────────────────────

interface SecretRule { id: string; re: RegExp }

/** Well-known token formats. Deliberately specific: a false alarm on ordinary code is worse than a miss. */
export const SECRET_RULES: ReadonlyArray<SecretRule> = [
    { id: 'anthropic-key', re: /sk-ant-[A-Za-z0-9_-]{20,}/g },
    { id: 'openai-key', re: /\bsk-(?:proj-|svcacct-)?[A-Za-z0-9_-]{32,}/g },
    { id: 'stripe-live-key', re: /\b[sr]k_live_[A-Za-z0-9]{16,}/g },
    { id: 'github-token', re: /\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{36,}/g },
    { id: 'github-fine-grained-token', re: /\bgithub_pat_[A-Za-z0-9_]{50,}/g },
    { id: 'aws-access-key', re: /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/g },
    { id: 'slack-token', re: /\bxox[abprs]-[A-Za-z0-9-]{10,}/g },
    { id: 'google-api-key', re: /\bAIza[A-Za-z0-9_-]{35}\b/g },
    { id: 'private-key-block', re: /-----BEGIN (?:RSA |EC |DSA |OPENSSH |PGP )?PRIVATE KEY(?: BLOCK)?-----[\s\S]*?(?:-----END [A-Z ]*PRIVATE KEY(?: BLOCK)?-----|$)/g },
    { id: 'jwt', re: /\beyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g },
    {
        id: 'credential-assignment',
        // KEY=value / "token": "value" with a long, non-placeholder value
        re: /\b[A-Za-z0-9_]*(?:API_?KEY|SECRET|TOKEN|PASSWORD|PASSWD|PRIVATE_?KEY)[A-Za-z0-9_]*["']?\s*[:=]\s*["']?(?!<|\$\{|\{\{|your[_-]|example|changeme|placeholder|xxx|\*\*\*|null|none|true|false)[A-Za-z0-9/+_=.-]{20,}["']?/gi,
    },
];

export interface SecretFinding { rule: string; count: number }

/** Which secret formats appear in `text` — rule ids and counts only, never values. */
export function findSecrets(text: string): SecretFinding[] {
    const out: SecretFinding[] = [];
    for (const { id, re } of SECRET_RULES) {
        const n = (text.match(new RegExp(re.source, re.flags)) ?? []).length;
        if (n > 0) { out.push({ rule: id, count: n }); }
    }
    return out;
}

/** Replaces every secret in `text` with `<redacted:rule>`; used on tool output headed for the model. */
export function redactSecrets(text: string): { text: string; count: number } {
    let count = 0;
    let out = text;
    for (const { id, re } of SECRET_RULES) {
        out = out.replace(new RegExp(re.source, re.flags), () => { count++; return `<redacted:${id}>`; });
    }
    return { text: out, count };
}

// ── indicators of compromise (CLAUDE.md §5) ────────────────────────────────

const IOC_RULES: ReadonlyArray<{ id: string; re: RegExp; reason: string }> = [
    { id: 'ioc-known-host', re: /193\.32\.204\.199/, reason: 'contains a known malicious host' },
    { id: 'ioc-pipe-to-shell', re: /\b(?:curl|wget)\b[^\n|]*\|\s*(?:sudo\s+)?(?:ba|z|da)?sh\b/i, reason: 'downloads and pipes to a shell' },
    { id: 'ioc-post-to-ip', re: /\b(?:curl|wget)\b[^\n]*(?:--data|--upload-file|-d\s|-F\s|-T\s|-X\s*POST)[^\n]*https?:\/\/\d{1,3}(?:\.\d{1,3}){3}/i, reason: 'sends data to a raw IP address' },
    { id: 'ioc-folder-open-task', re: /["']?runOn["']?\s*:\s*["']folderOpen["']/i, reason: 'an editor task that runs automatically when the folder opens' },
    { id: 'ioc-hidden-task', re: /["']?reveal["']?\s*:\s*["']never["']|["']?hide["']?\s*:\s*true/i, reason: 'a hidden editor task' },
    { id: 'ioc-eval-base64', re: /\b(?:eval|Function)\s*\(\s*(?:atob|Buffer\.from)\s*\(|\bFunction\s*\(\s*atob/i, reason: 'evaluates decoded base64' },
    { id: 'ioc-long-base64', re: /["'`][A-Za-z0-9+/]{400,}={0,2}["'`]/, reason: 'a very long embedded base64 blob' },
];

export function findIocs(text: string): Array<{ rule: string; reason: string }> {
    return IOC_RULES.filter(r => r.re.test(text)).map(r => ({ rule: r.id, reason: r.reason }));
}

// ── paths ──────────────────────────────────────────────────────────────────

const WRITE_DENY_DIRS = ['.git'];
const WRITE_CONFIRM_DIRS = ['.vscode', '.cursor', '.claude', '.idea'];
const CONFIRM_FILES = new Set([
    'soriku.md', '.soriku.md', 'agents.md', 'claude.md', 'package.json', 'composer.json', 'package-lock.json', 'yarn.lock',
    'pnpm-lock.yaml', 'composer.lock', 'dockerfile', 'makefile', '.gitignore', '.npmrc', '.yarnrc', '.gitmodules',
]);
const ENV_TEMPLATE = /\.(example|sample|template|dist)$/i;
const SENSITIVE_FILE = /(^|\/)(\.env(\.[^/]*)?|[^/]*\.(pem|key|p12|pfx|jks)|id_(rsa|dsa|ecdsa|ed25519)(\.pub)?|\.netrc|\.pgpass|credentials(\.json)?)$/i;
const SENSITIVE_DIR = /(^|\/)(\.ssh|\.aws|\.gnupg)(\/|$)/;
const BINARY_EXT = /\.(woff2?|ttf|otf|eot|png|jpe?g|gif|ico|webp|pdf|zip|gz|mp[34]|mov)$/i;

export function isSensitiveFile(rel: string): boolean {
    const p = rel.replace(/\\/g, '/');
    if (ENV_TEMPLATE.test(p) && /(^|\/)\.env/i.test(p)) { return false; }
    return SENSITIVE_FILE.test(p) || SENSITIVE_DIR.test(p);
}

export type PathOp = 'read' | 'write';

export interface PathCheckInput {
    path: string;
    root: string;
    op: PathOp;
    /** Real path after resolving symlinks, when the caller could compute it. */
    resolved?: string;
}

export function checkPath(input: PathCheckInput): GuardDecision {
    const { path, root, op } = input;
    if (!path.trim()) { return ALLOW; }
    if (path.startsWith('~') || /^[A-Za-z]:[\\/]/.test(path)) {
        return deny('path-outside-workspace', `"${path}" is outside the workspace.`);
    }
    const abs = path.startsWith('/') ? normalizePosixPath(path) : normalizePosixPath(`${root}/${path}`);
    if (!isPathWithinRoot(root, abs)) {
        return deny('path-outside-workspace', `"${path}" is outside the workspace.`);
    }
    if (input.resolved !== undefined && !isPathWithinRoot(normalizePosixPath(root), normalizePosixPath(input.resolved))) {
        return deny('symlink-escape', `"${path}" resolves through a symlink to a place outside the workspace.`);
    }
    const rel = abs === normalizePosixPath(root) ? '' : abs.slice(normalizePosixPath(root).length).replace(/^\//, '');
    const parts = rel.split('/').filter(Boolean);
    const lower = parts.map(p => p.toLowerCase());
    const name = lower[lower.length - 1] ?? '';

    if (op === 'read') {
        return isSensitiveFile(rel) ? confirm('sensitive-read', `"${rel}" may hold secrets; its contents will be redacted before the agent sees them.`) : ALLOW;
    }
    // write
    if (lower.some(p => WRITE_DENY_DIRS.includes(p))) { return deny('write-git-internals', `Agents may not write inside .git (${rel}).`); }
    if (lower[0] === '.github' && lower[1] === 'workflows') { return deny('write-ci-workflow', `Agents may not create or change CI workflows (${rel}) — they run with repository secrets.`); }
    if (lower[0] === '.vscode' && name === 'tasks.json') { return deny('write-editor-task', 'Agents may not create editor tasks (.vscode/tasks.json) — they can run code when the folder opens.'); }
    if (isSensitiveFile(rel)) { return deny('write-secret-file', `Agents may not write secret files (${rel}). Ask the user to create it.`); }
    if (lower.some(p => WRITE_CONFIRM_DIRS.includes(p)) || lower[0] === '.github') { return confirm('write-tooling-config', `${rel} configures tooling that can run code or change agent behaviour.`); }
    if (CONFIRM_FILES.has(name)) { return confirm('write-project-config', `${rel} changes how the project builds or how agents behave.`); }
    return ALLOW;
}

/** What a write is about to put in a file: secrets and IOCs are denied, and "font"/"image" files must not be scripts. */
export function checkWriteContent(path: string, content: string): GuardDecision {
    let decision = ALLOW;
    const secrets = findSecrets(content);
    if (secrets.length > 0) {
        decision = stricter(decision, deny('secret-in-content', `The content contains what looks like a secret (${secrets.map(s => s.rule).join(', ')}). Use a placeholder like <token>.`));
    }
    for (const ioc of findIocs(content)) {
        decision = stricter(decision, deny(ioc.rule, `The content ${ioc.reason}.`));
    }
    if (BINARY_EXT.test(path) && /^\s*(#!|const |let |var |require\(|import |<\?php|function |\(function|module\.exports)/.test(content)) {
        decision = stricter(decision, deny('script-disguised-as-asset', `"${path}" looks like an image/font but contains script code.`));
    }
    return decision;
}

// ── shell ──────────────────────────────────────────────────────────────────

const SHELLS = new Set(['bash', 'sh', 'zsh', 'dash', 'ksh', 'fish', 'csh', 'tcsh']);
const INLINE_FLAGS: Record<string, string[]> = {
    python: ['-c'], python3: ['-c'], node: ['-e', '--eval', '-p', '--print'], php: ['-r'], ruby: ['-e'], perl: ['-e', '-E'],
};
const NETWORK_TOOLS = new Set(['curl', 'wget', 'nc', 'ncat', 'netcat', 'ssh', 'scp', 'sftp', 'rsync', 'ftp', 'telnet', 'socat']);
const PRIVILEGE = new Set(['sudo', 'su', 'doas']);
const FILE_READERS = new Set(['cat', 'head', 'tail', 'less', 'more', 'bat', 'xxd', 'strings', 'rg', 'grep', 'sed', 'awk']);
const FILE_MUTATORS = new Set(['rm', 'mv', 'cp', 'chmod', 'chown', 'touch', 'mkdir', 'tee', 'dd', 'ln', 'truncate', 'rmdir']);
const PACKAGE_MANAGERS = new Set(['npm', 'yarn', 'pnpm', 'composer', 'pip', 'pip3', 'cargo', 'go', 'gem', 'bundle']);

function looksLikePath(arg: string): boolean {
    return !arg.startsWith('-') && (arg.startsWith('/') || arg.startsWith('~') || arg.startsWith('.') || arg.includes('/') || /\.[A-Za-z0-9]{1,8}$/.test(arg));
}

export function checkCommand(command: string, root: string, cwd?: string): GuardDecision {
    let decision = ALLOW;
    const argv = splitShellCommand(command);
    if (argv.length === 0) { return deny('empty-command', 'No command.'); }
    const base = (argv[0].split('/').pop() ?? argv[0]).toLowerCase();
    const rest = argv.slice(1);
    const sub = rest.find(a => !a.startsWith('-'))?.toLowerCase();

    for (const ioc of findIocs(command)) { decision = stricter(decision, deny(ioc.rule, `The command ${ioc.reason}.`)); }
    if (cwd && cwd.trim()) {
        decision = stricter(decision, checkPath({ path: cwd, root, op: 'read' }));
        if (decision.verdict === 'deny') { return decision; }
    }
    if (PRIVILEGE.has(base)) { return stricter(decision, deny('privilege-escalation', `${base} is not allowed.`)); }
    if (NETWORK_TOOLS.has(base)) { return stricter(decision, deny('network-tool', `${base} can send data off this machine.`)); }
    if (SHELLS.has(base) && rest.some(a => /^-[a-z]*c[a-z]*$/i.test(a))) {
        return stricter(decision, deny('shell-inline-code', `${base} -c runs arbitrary code and bypasses the command checks.`));
    }
    if ((INLINE_FLAGS[base] ?? []).some(f => rest.includes(f))) {
        return stricter(decision, deny('inline-code', `${base} with an inline code flag runs arbitrary code. Put the code in a file in the workspace and run that.`));
    }
    if (((base === 'env' || base === 'printenv') && rest.every(a => a.startsWith('-'))) || (base === 'set' && rest.length === 0)) {
        return stricter(decision, deny('env-dump', 'Dumping environment variables can expose secrets.'));
    }
    if (base === 'git') {
        if (sub === 'push') { return stricter(decision, deny('git-push', 'Agents may not push; the user pushes when ready.')); }
        if (sub === 'remote' && rest.some(a => ['add', 'set-url'].includes(a))) { return stricter(decision, deny('git-remote-change', 'Agents may not change git remotes.')); }
        if (sub === 'config' && rest.some(a => /credential|url\./i.test(a))) { return stricter(decision, deny('git-config-credentials', 'Agents may not change git credential settings.')); }
        if (['commit', 'merge', 'rebase', 'stash', 'tag', 'cherry-pick'].includes(sub ?? '')) { decision = stricter(decision, confirm('git-history', `git ${sub} changes repository history.`)); }
        const destructive = (sub === 'reset' && rest.includes('--hard')) || sub === 'clean' || (sub === 'checkout' && rest.includes('--')) || (sub === 'branch' && rest.includes('-D'));
        if (destructive) {
            decision = stricter(decision, confirm('git-destructive', `git ${sub} can discard work.`));
        }
    }
    if (PACKAGE_MANAGERS.has(base)) {
        if (sub === 'publish' || sub === 'login' || sub === 'adduser') { return stricter(decision, deny('package-publish', `${base} ${sub} sends data to a registry.`)); }
        if (['install', 'i', 'add', 'update', 'upgrade', 'require', 'remove', 'uninstall', 'ci', 'get'].includes(sub ?? '')) {
            decision = stricter(decision, confirm('dependency-change', `${base} ${sub} changes dependencies and can run install scripts.`));
        }
    }
    const pathArgs = rest.filter(looksLikePath);
    if (FILE_MUTATORS.has(base) || FILE_READERS.has(base)) {
        for (const arg of pathArgs) {
            const op: PathOp = FILE_MUTATORS.has(base) ? 'write' : 'read';
            const d = checkPath({ path: arg, root, op });
            decision = stricter(decision, d);
        }
        if (base === 'rm' && rest.some(a => /^-[a-zA-Z]*[rR]/.test(a))) { decision = stricter(decision, confirm('recursive-delete', 'Recursive delete.')); }
        if (base === 'chmod' && rest.some(a => /^-[a-zA-Z]*R/.test(a))) { decision = stricter(decision, confirm('recursive-chmod', 'Recursive permission change.')); }
    }
    return decision;
}

// ── tool calls ─────────────────────────────────────────────────────────────

export interface GuardInput {
    tool: string;
    args: Record<string, unknown>;
    workspaceRoot: string;
    /** Real path of the target after symlink resolution (computed by the caller; the policy itself does no IO). */
    resolvedPath?: string;
}

const str = (v: unknown): string => (typeof v === 'string' ? v : '');

/** The single entrance: should this delegated tool call run, ask, or never run? */
export function evaluateToolCall(input: GuardInput): GuardDecision {
    const { tool, args, workspaceRoot: root } = input;
    const path = str(args.path) || str(args.file_path) || str(args.file);
    switch (tool) {
        case 'file_write': {
            return stricter(checkPath({ path, root, op: 'write', resolved: input.resolvedPath }), checkWriteContent(path, str(args.content)));
        }
        case 'apply_patch': {
            const patch = str(args.patch) || str(args.diff) || str(args.content);
            const header = /^\+\+\+ [ab]?\/?(\S+)/m.exec(patch)?.[1] ?? '';
            const target = path || header;
            const added = patch.split('\n').filter(l => l.startsWith('+') && !l.startsWith('+++')).map(l => l.slice(1)).join('\n');
            return stricter(checkPath({ path: target, root, op: 'write', resolved: input.resolvedPath }), checkWriteContent(target, added));
        }
        case 'file_read':
        case 'list_directory':
            return checkPath({ path, root, op: 'read', resolved: input.resolvedPath });
        case 'project_search':
            return path ? checkPath({ path, root, op: 'read', resolved: input.resolvedPath }) : ALLOW;
        case 'shell_exec':
            return checkCommand(str(args.command) || str(args.cmd), root, str(args.cwd) || undefined);
        default:
            return ALLOW;   // other tools (MCP, job status/stop, …) keep their own confirmation rules
    }
}

/** Short, secret-free description of the target for the audit log. */
export function auditTarget(tool: string, args: Record<string, unknown>): string {
    const raw = tool === 'shell_exec' ? (str(args.command) || str(args.cmd)) : (str(args.path) || str(args.file_path) || str(args.file));
    return redactSecrets(raw).text.slice(0, 200);
}
