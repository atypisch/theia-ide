/********************************************************************************
 * Soriku IDE — MCP servers model (pure, Theia-free, unit-testable)
 *
 * SPDX-License-Identifier: MIT
 ********************************************************************************/

import { McpServer } from 'soriku-engine-client-ext/lib/common/engine-types';

export type Transport = 'stdio' | 'sse';

/** A draft for the add/edit form — strings, before normalisation into McpServer. */
export interface ServerDraft {
    name: string;
    transport: Transport;
    command: string;      // stdio: e.g. "npx"
    args: string;         // stdio: whitespace-separated, e.g. "-y @scope/server"
    url: string;          // sse
    requiresConfirmation: boolean;
}

export function emptyDraft(): ServerDraft {
    return { name: '', transport: 'stdio', command: '', args: '', url: '', requiresConfirmation: true };
}

export interface ValidationResult {
    ok: boolean;
    error?: string;
}

/** Validate a draft against the transport's required fields. */
export function validateDraft(draft: ServerDraft, existingNames: string[] = []): ValidationResult {
    const name = draft.name.trim();
    if (!name) {
        return { ok: false, error: 'Enter a unique server name.' };
    }
    if (!/^[a-zA-Z0-9_-]+$/.test(name)) {
        return { ok: false, error: 'Name may only contain letters, numbers, "-" and "_".' };
    }
    if (existingNames.includes(name)) {
        return { ok: false, error: `A server named "${name}" already exists.` };
    }
    if (draft.transport === 'stdio') {
        if (!draft.command.trim()) {
            return { ok: false, error: 'stdio transport needs a command (e.g. npx).' };
        }
    } else if (draft.transport === 'sse') {
        if (!/^https?:\/\//.test(draft.url.trim())) {
            return { ok: false, error: 'sse transport needs an http(s) URL.' };
        }
    } else {
        return { ok: false, error: 'Unknown transport.' };
    }
    return { ok: true };
}

/** Normalise a validated draft into the engine's McpServer shape. */
export function draftToServer(draft: ServerDraft): McpServer {
    const base: McpServer = {
        name: draft.name.trim(),
        transport: draft.transport,
        enabled: true,
        requires_confirmation: draft.requiresConfirmation,
    };
    if (draft.transport === 'stdio') {
        base.command = draft.command.trim();
        const args = draft.args.trim();
        base.args = args ? args.split(/\s+/) : [];
    } else {
        base.url = draft.url.trim();
    }
    return base;
}

/** A short, human label for a server's health value. */
export function healthLabel(health: Record<string, string> | undefined, name: string): string {
    const v = health?.[name];
    if (!v) {
        return 'unknown';
    }
    return v === 'ok' ? 'connected' : `error: ${v}`;
}

export function isHealthy(health: Record<string, string> | undefined, name: string): boolean {
    return health?.[name] === 'ok';
}
