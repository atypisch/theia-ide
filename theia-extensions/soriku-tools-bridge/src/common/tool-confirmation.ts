/********************************************************************************
 * Soriku IDE — tool confirmation model (pure, Theia-free, unit-testable)
 *
 * The engine executes tools server-side and asks the IDE only to APPROVE or DENY
 * via a `confirm_tool` SSE event + POST /api/worker/confirm. This module turns a
 * confirm_tool event into a human-readable confirmation request.
 *
 * SPDX-License-Identifier: MIT
 ********************************************************************************/

import { SorikuSseEvent } from 'soriku-engine-client-ext/lib/common/engine-types';

export interface ToolConfirmationRequest {
    confirmationId: string;
    tool: string;
    args: unknown;
    iteration?: number;
}

/** Tools that change the workspace or run commands — flagged prominently in the dialog. */
const DESTRUCTIVE_TOOLS = new Set(['file_write', 'file_delete', 'apply_patch', 'shell_exec', 'run_command']);

export function isDestructive(tool: string): boolean {
    return DESTRUCTIVE_TOOLS.has(tool);
}

/** Extract a confirmation request from a `confirm_tool` SSE event, or undefined if malformed. */
export function parseConfirmToolEvent(event: SorikuSseEvent): ToolConfirmationRequest | undefined {
    if (event.type !== 'confirm_tool') {
        return undefined;
    }
    const confirmationId = typeof event.confirmation_id === 'string' ? event.confirmation_id : undefined;
    const tool = typeof event.tool === 'string' ? event.tool : undefined;
    if (!confirmationId || !tool) {
        return undefined;
    }
    return {
        confirmationId,
        tool,
        args: event.args,
        iteration: typeof event.iteration === 'number' ? event.iteration : undefined,
    };
}

export function summarizeArgs(args: unknown, maxLength = 400): string {
    // eslint-disable-next-line no-null/no-null
    if (args === undefined || args === null) {
        return '';
    }
    let text: string;
    try {
        text = typeof args === 'string' ? args : JSON.stringify(args);
    } catch {
        text = String(args);
    }
    return text.length > maxLength ? `${text.slice(0, maxLength)}…` : text;
}

export interface ToolConfirmationView {
    title: string;
    message: string;
    destructive: boolean;
}

export function describeToolConfirmation(request: ToolConfirmationRequest): ToolConfirmationView {
    const destructive = isDestructive(request.tool);
    const argsSummary = summarizeArgs(request.args);
    const lead = destructive
        ? 'A Soriku agent wants to run a destructive tool.'
        : 'A Soriku agent wants to run a tool.';
    const message = `${lead}\n\nTool: ${request.tool}${argsSummary ? `\nArguments: ${argsSummary}` : ''}`;
    return {
        title: destructive ? 'Confirm destructive tool' : 'Confirm tool',
        message,
        destructive,
    };
}
