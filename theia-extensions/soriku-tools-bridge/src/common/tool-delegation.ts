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

export interface ToolRequest {
    requestId: string;
    tool: string;
    args: Record<string, unknown>;
    iteration?: number;
}

/**
 * Tools the IDE executes itself against the open workspace. Sent to the engine
 * as `client_tools`; everything else stays server-side. Filesystem-scoped tools
 * only — shell/search/document generation remain on the engine for now.
 */
export const DELEGATED_TOOLS: readonly string[] = ['file_read', 'file_write', 'list_directory'];

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

export function okResult(result: string): ToolExecResult {
    return { result };
}

export function errorResult(error: string): ToolExecResult {
    return { error };
}
