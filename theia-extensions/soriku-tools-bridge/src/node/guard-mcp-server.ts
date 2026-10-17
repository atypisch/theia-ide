/********************************************************************************
 * Soriku IDE — soriku-guard as an MCP server (protocol handler, pure of IO).
 *
 * The same policy the IDE enforces, offered as tools an agent (or the engine) can
 * call: "may I run this?", "is this text a secret?", "is this path safe?". It only
 * ANSWERS; the mandatory enforcement is the IDE's hook in executeDelegated and
 * the engine's pre-dispatch check, because a tool an agent may choose to call
 * cannot stop one it chooses not to.
 *
 * Transport: newline-delimited JSON-RPC 2.0 on stdio (MCP stdio transport), no
 * dependencies.
 *
 * SPDX-License-Identifier: MIT
 ********************************************************************************/

import { suspiciousInstructionSignals } from 'soriku-engine-client-ext/lib/common/soriku-md';
import { checkCommand, checkPath, evaluateToolCall, findIocs, findSecrets } from '../common/guard-policy';

export const SERVER_INFO = { name: 'soriku-guard', version: '0.1.0' };
const DEFAULT_PROTOCOL = '2024-11-05';

export interface JsonRpcRequest {
    jsonrpc: '2.0';
    id?: number | string;
    method: string;
    params?: Record<string, unknown>;
}

export interface JsonRpcResponse {
    jsonrpc: '2.0';
    id: number | string | undefined;
    result?: unknown;
    error?: { code: number; message: string };
}

export interface GuardMcpContext {
    workspaceRoot: string;
    /** Resolves symlinks for a path; undefined when unresolvable. Injected so this module stays IO-free. */
    realpath?: (path: string) => string | undefined;
}

const object = (properties: Record<string, unknown>, required: string[]): Record<string, unknown> => ({ type: 'object', properties, required });
const string = (description: string): Record<string, unknown> => ({ type: 'string', description });

export const TOOLS = [
    {
        name: 'guard_check_tool_call',
        description: 'Decide whether a tool call (file_write, apply_patch, file_read, list_directory, project_search, shell_exec) may run: allow, confirm or deny, with reasons.',
        inputSchema: object({ tool: string('Tool name'), args: { type: 'object', description: 'The tool arguments' } }, ['tool', 'args']),
    },
    {
        name: 'guard_scan_text',
        description: 'Find secrets (token formats, private keys, credential assignments) and indicators of compromise in text. Returns rule ids and counts, never the values.',
        inputSchema: object({ text: string('Text to scan') }, ['text']),
    },
    {
        name: 'guard_check_path',
        description: 'Check one path against the workspace: containment, symlinks, protected files (.git, CI workflows, editor tasks, secret files).',
        inputSchema: object({ path: string('Path to check'), op: { type: 'string', enum: ['read', 'write'] } }, ['path', 'op']),
    },
    {
        name: 'guard_check_command',
        description: 'Check a shell command: inline-code interpreters, network tools, git push, package publish, dependency changes, paths outside the workspace.',
        inputSchema: object({ command: string('The command line'), cwd: string('Working directory (optional)') }, ['command']),
    },
    {
        name: 'guard_check_instructions',
        description: 'Look for prompt-injection signals in an instructions file (soriku.md, AGENTS.md, CLAUDE.md) before trusting it.',
        inputSchema: object({ text: string('Instructions text') }, ['text']),
    },
];

function text(result: unknown): { content: Array<{ type: 'text'; text: string }> } {
    return { content: [{ type: 'text', text: JSON.stringify(result) }] };
}

function toolError(message: string): { content: Array<{ type: 'text'; text: string }>; isError: true } {
    return { content: [{ type: 'text', text: message }], isError: true };
}

const str = (v: unknown): string => (typeof v === 'string' ? v : '');

export function callTool(name: string, args: Record<string, unknown>, ctx: GuardMcpContext): unknown {
    const root = ctx.workspaceRoot;
    switch (name) {
        case 'guard_check_tool_call': {
            const toolArgs = (args.args && typeof args.args === 'object' ? args.args : {}) as Record<string, unknown>;
            const target = str(toolArgs.path);
            const resolvedPath = target && ctx.realpath ? ctx.realpath(target.startsWith('/') ? target : `${root}/${target}`) : undefined;
            return text(evaluateToolCall({ tool: str(args.tool), args: toolArgs, workspaceRoot: root, resolvedPath }));
        }
        case 'guard_scan_text': {
            const body = str(args.text);
            return text({ secrets: findSecrets(body), indicators: findIocs(body) });
        }
        case 'guard_check_path': {
            const path = str(args.path);
            const resolved = ctx.realpath?.(path.startsWith('/') ? path : `${root}/${path}`);
            return text(checkPath({ path, root, op: args.op === 'write' ? 'write' : 'read', resolved }));
        }
        case 'guard_check_command':
            return text(checkCommand(str(args.command), root, str(args.cwd) || undefined));
        case 'guard_check_instructions':
            return text({ signals: suspiciousInstructionSignals(str(args.text)) });
        default:
            return toolError(`Unknown tool: ${name}`);
    }
}

/** One JSON-RPC message in, zero or one response out (notifications get none). */
export function handleMessage(message: JsonRpcRequest, ctx: GuardMcpContext): JsonRpcResponse | undefined {
    const reply = (result: unknown): JsonRpcResponse => ({ jsonrpc: '2.0', id: message.id, result });
    const fail = (code: number, msg: string): JsonRpcResponse => ({ jsonrpc: '2.0', id: message.id, error: { code, message: msg } });
    if (message.id === undefined) {
        return undefined;   // notification (e.g. notifications/initialized)
    }
    switch (message.method) {
        case 'initialize':
            return reply({
                protocolVersion: str(message.params?.protocolVersion) || DEFAULT_PROTOCOL,
                capabilities: { tools: {} },
                serverInfo: SERVER_INFO,
            });
        case 'ping':
            return reply({});
        case 'tools/list':
            return reply({ tools: TOOLS });
        case 'tools/call': {
            const params = message.params ?? {};
            const args = (params.arguments && typeof params.arguments === 'object' ? params.arguments : {}) as Record<string, unknown>;
            return reply(callTool(str(params.name), args, ctx));
        }
        default:
            return fail(-32601, `Method not found: ${message.method}`);
    }
}

/** Parses one stdio line into a request, or an error response for malformed input. */
export function parseLine(line: string): { request?: JsonRpcRequest; error?: JsonRpcResponse } {
    const trimmed = line.trim();
    if (!trimmed) { return {}; }
    try {
        const value = JSON.parse(trimmed);
        if (value && typeof value === 'object' && value.jsonrpc === '2.0' && typeof value.method === 'string') {
            return { request: value as JsonRpcRequest };
        }
        return { error: { jsonrpc: '2.0', id: undefined, error: { code: -32600, message: 'Invalid Request' } } };
    } catch {
        return { error: { jsonrpc: '2.0', id: undefined, error: { code: -32700, message: 'Parse error' } } };
    }
}
