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
    return asString(event.confirmation_id) ?? asString(event.call_id) ?? asString(event.id);
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
            next.model = asString(event.to) ?? next.model;
            break;
        case 'routing':
            next.model = asString(event.model) ?? next.model;
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
        case 'tool_call': {
            next.toolCalls.push({
                callId: callIdOf(event),
                tool: asString(event.tool) ?? 'tool',
                args: event.args,
                status: event.type === 'confirm_tool' ? 'requested' : 'running',
            });
            break;
        }
        case 'tool_result': {
            const callId = callIdOf(event);
            const idx = next.toolCalls.findIndex(t => t.callId !== undefined && t.callId === callId);
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
