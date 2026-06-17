/********************************************************************************
 * Soriku IDE — chat model: fold engine SSE events into a view turn (pure)
 *
 * SPDX-License-Identifier: MIT
 ********************************************************************************/

import { SorikuSseEvent } from 'soriku-engine-client-ext/lib/common/engine-types';

export interface ChatToolCall {
    callId?: string;
    tool: string;
    args?: unknown;
    status: 'requested' | 'running' | 'done';
    result?: unknown;
}

export interface AssistantTurn {
    role: 'assistant';
    id: string;
    /** Model that produced this answer — surfaced for transparency (from SSE meta). */
    model?: string;
    /** Who responded (agent name / role) from SSE meta. */
    respondedBy?: string;
    conversationId?: string;
    text: string;
    toolCalls: ChatToolCall[];
    /** Latest progress message from the engine (status / plan / worker events). */
    phase?: string;
    status: 'streaming' | 'done' | 'error';
    error?: string;
}

export interface UserMessage {
    role: 'user';
    id: string;
    text: string;
}

export type ChatMessage = UserMessage | AssistantTurn;

export function createAssistantTurn(id: string): AssistantTurn {
    return { role: 'assistant', id, text: '', toolCalls: [], status: 'streaming' };
}

function asString(value: unknown): string | undefined {
    return typeof value === 'string' ? value : undefined;
}

function callIdOf(event: SorikuSseEvent): string | undefined {
    return asString(event.request_id) ?? asString(event.confirmation_id) ?? asString(event.call_id) ?? asString(event.id);
}

/** Index of the last tool call that has not completed yet (for matching results without an id). */
function lastUnfinished(calls: ChatToolCall[], tool?: string): number {
    for (let i = calls.length - 1; i >= 0; i--) {
        if (calls[i].status !== 'done' && (tool === undefined || calls[i].tool === tool)) {
            return i;
        }
    }
    return -1;
}

/**
 * Upsert a tool call: reuse the matching/last-unfinished entry so an engine event and its
 * delegated `tool_request` don't show as duplicates, then resolve it on `tool_result`.
 */
function upsertToolCall(calls: ChatToolCall[], event: SorikuSseEvent, status: ChatToolCall['status']): void {
    const callId = callIdOf(event);
    const tool = asString(event.tool) ?? 'tool';
    let idx = callId ? calls.findIndex(c => c.callId === callId) : -1;
    if (idx < 0) {
        idx = lastUnfinished(calls, tool);
    }
    if (idx >= 0) {
        calls[idx] = { ...calls[idx], status, tool, args: event.args ?? calls[idx].args, callId: callId ?? calls[idx].callId };
    } else {
        calls.push({ callId, tool, args: event.args, status });
    }
}

/**
 * Fold one SSE event into the current assistant turn. Pure & immutable: returns a new turn so the
 * widget can keep prior snapshots and the logic is unit-testable without Theia or the network.
 */
export function reduceSseEvent(turn: AssistantTurn, event: SorikuSseEvent): AssistantTurn {
    const next: AssistantTurn = { ...turn, toolCalls: turn.toolCalls.slice() };
    switch (event.type) {
        case 'meta':
            next.model = asString(event.model) ?? next.model;
            next.respondedBy = asString(event.responded_by) ?? asString(event.agent_name) ?? asString(event.role) ?? next.respondedBy;
            next.conversationId = asString(event.conversation_id) ?? next.conversationId;
            break;
        case 'model_switch':
        case 'model_assist':
            next.model = asString(event.to) ?? asString(event.model) ?? next.model;
            break;
        case 'routing':
            next.model = asString(event.model) ?? next.model;
            break;
        case 'status':
            next.phase = asString(event.content) ?? asString(event.message) ?? asString(event.status) ?? next.phase;
            break;
        case 'plan_generated':
            next.phase = 'Planning workers…';
            break;
        case 'synthesis_done':
            next.phase = 'Merging answers…';
            break;
        case 'chunk':
            next.text += asString(event.content) ?? '';
            break;
        case 'answer': {
            const answer = asString(event.content) ?? asString(event.answer);
            if (answer) {
                next.text = answer;
            }
            break;
        }
        case 'confirm_tool':
            upsertToolCall(next.toolCalls, event, 'requested');
            break;
        case 'tool_request':
        case 'tool_call':
            upsertToolCall(next.toolCalls, event, 'running');
            break;
        case 'tool_result': {
            const callId = callIdOf(event);
            let idx = callId ? next.toolCalls.findIndex(t => t.callId === callId) : -1;
            if (idx < 0) {
                idx = lastUnfinished(next.toolCalls, asString(event.tool));
            }
            if (idx >= 0) {
                next.toolCalls[idx] = { ...next.toolCalls[idx], status: 'done', result: event.result ?? event.output };
            }
            break;
        }
        case 'error':
            next.status = 'error';
            next.error = asString(event.content) ?? asString(event.message) ?? 'Stream error';
            break;
        case 'done':
            if (next.status === 'streaming') {
                next.status = 'done';
            }
            break;
        default:
            break;
    }
    return next;
}

/** Human-readable label for the busy indicator while a turn is still streaming. */
export function busyPhase(turn: AssistantTurn): string {
    const running = turn.toolCalls.find(c => c.status !== 'done');
    if (running) {
        return running.status === 'requested' ? `Awaiting approval: ${running.tool}` : `Running ${running.tool}…`;
    }
    if (turn.phase) {
        return turn.phase;
    }
    return turn.text ? 'Writing…' : 'Thinking…';
}
