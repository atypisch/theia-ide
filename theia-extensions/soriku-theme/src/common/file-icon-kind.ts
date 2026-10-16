/********************************************************************************
 * Soriku IDE — maps a file name to its icon kind. Port of `fIcon()` from the v2
 * mockup (`Soriku IDE v2.dc.html`, ~l.1928), plus `php`/`vue` for the stacks we
 * actually work in. Pure so it can be unit-tested without React.
 *
 * SPDX-License-Identifier: MIT
 ********************************************************************************/

export type FileIconKind = 'chat' | 'plan' | 'db' | 'code' | 'code-test' | 'config' | 'text';

const DB_EXT = ['sql', 'db', 'sqlite', 'prisma'];
const CODE_EXT = ['py', 'ts', 'tsx', 'js', 'jsx', 'go', 'rs', 'rb', 'java', 'sh', 'php', 'vue'];
const CONFIG_EXT = ['toml', 'json', 'yaml', 'yml', 'ini', 'lock'];

/** Suffixes that mark an env file as a committed template rather than real secrets. */
const ENV_TEMPLATE = /\.(example|sample|template|dist)$/;

function baseName(name: string): string {
    const n = (name || '').toLowerCase();
    return n.slice(n.lastIndexOf('/') + 1);
}

/** True for `.env`, `.env.production`, … but not `.env.example`. Used for the struck-through danger tab. */
export function isEnvSecretFile(name: string): boolean {
    const n = baseName(name);
    return (n === '.env' || n.startsWith('.env.')) && !ENV_TEMPLATE.test(n);
}

function isTestFile(n: string): boolean {
    return n.startsWith('test') || /(^|[._-])(test|spec)[._]/.test(n) || /_test\./.test(n);
}

export function fileIconKind(name: string): FileIconKind {
    const n = baseName(name);
    const ext = n.includes('.') ? n.slice(n.lastIndexOf('.') + 1) : '';
    if (n === 'chat') { return 'chat'; }
    if (n.startsWith('plan')) { return 'plan'; }
    if (DB_EXT.includes(ext)) { return 'db'; }
    if (CODE_EXT.includes(ext)) { return isTestFile(n) ? 'code-test' : 'code'; }
    if (CONFIG_EXT.includes(ext) || n.startsWith('.env')) { return 'config'; }
    return 'text';
}
