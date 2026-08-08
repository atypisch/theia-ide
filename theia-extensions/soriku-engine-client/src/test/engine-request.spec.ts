/********************************************************************************
 * Soriku IDE — ChatStreamParams → ChatRequest wire-body mapping unit tests
 *
 * SPDX-License-Identifier: MIT
 ********************************************************************************/

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { toChatRequestBody } from '../common/engine-request';
import { ChatStreamParams } from '../common/engine-types';

function params(overrides: Partial<ChatStreamParams> = {}): ChatStreamParams {
    return { prompt: 'hello', personaId: 'agent-1', ...overrides };
}

describe('toChatRequestBody', () => {
    it('maps the required fields and always streams', () => {
        const body = toChatRequestBody(params());
        assert.equal(body.prompt, 'hello');
        assert.equal(body.persona_id, 'agent-1');
        assert.equal(body.stream, true);
    });

    it('omits images when none are attached', () => {
        const body = toChatRequestBody(params());
        assert.equal(body.images, undefined);
    });

    it('carries images through when present', () => {
        const body = toChatRequestBody(params({ images: ['aGVsbG8=', 'd29ybGQ='] }));
        assert.deepEqual(body.images, ['aGVsbG8=', 'd29ybGQ=']);
    });

    it('omits an empty images array (never sends [])', () => {
        const body = toChatRequestBody(params({ images: [] }));
        assert.equal(body.images, undefined);
    });

    it('forces plan_auto_execute=false in plan mode regardless of the flag passed in', () => {
        const body = toChatRequestBody(params({ mode: 'plan', planAutoExecute: true }));
        assert.equal(body.plan_auto_execute, false);
    });

    it('passes planAutoExecute through unchanged outside plan mode', () => {
        const body = toChatRequestBody(params({ mode: 'auto', planAutoExecute: true }));
        assert.equal(body.plan_auto_execute, true);
    });

    it('enables pilot_tools for every mode the IDE can send', () => {
        // 'ensemble' used to be excluded here; it is no longer a request mode
        // (Do:Plan → Plan by:Compare sends mode 'plan' + worker_models), and
        // a compare run gets tools like any other plan.
        for (const mode of ['plan', 'single', 'auto'] as const) {
            assert.equal(toChatRequestBody(params({ mode })).pilot_tools, true);
        }
    });

    it('carries worker_models on a plan request (the compare shape)', () => {
        const body = toChatRequestBody(params({ mode: 'plan', workerModels: ['a:1', 'b:2'] }));
        assert.equal(body.mode, 'plan');
        assert.deepEqual(body.worker_models, ['a:1', 'b:2']);
    });

    it('omits empty worker_models / client_tools / context arrays', () => {
        const body = toChatRequestBody(params({ workerModels: [], clientTools: [], context: [] }));
        assert.equal(body.worker_models, undefined);
        assert.equal(body.client_tools, undefined);
        assert.equal(body.context, undefined);
    });

    it('carries non-empty worker_models / client_tools / context through', () => {
        const body = toChatRequestBody(params({
            workerModels: ['m1', 'm2'],
            clientTools: ['file_read'],
            context: [{ type: 'text', value: 'x' }],
        }));
        assert.deepEqual(body.worker_models, ['m1', 'm2']);
        assert.deepEqual(body.client_tools, ['file_read']);
        assert.deepEqual(body.context, [{ type: 'text', value: 'x' }]);
    });

    it('sends plan_model_id only in plan mode', () => {
        assert.equal(toChatRequestBody(params({ mode: 'plan', planModelId: 'ollama:qwen2.5-coder:14b' })).plan_model_id, 'ollama:qwen2.5-coder:14b');
        assert.equal(toChatRequestBody(params({ mode: 'auto', planModelId: 'ollama:qwen2.5-coder:14b' })).plan_model_id, undefined);
    });

    it('sends plan_models only in plan mode with 2+ entries', () => {
        const body = toChatRequestBody(params({ mode: 'plan', planModels: ['m1', 'm2'] }));
        assert.deepEqual(body.plan_models, ['m1', 'm2']);
        assert.equal(toChatRequestBody(params({ mode: 'plan', planModels: ['m1'] })).plan_models, undefined);
        assert.equal(toChatRequestBody(params({ mode: 'auto', planModels: ['m1', 'm2'] })).plan_models, undefined);
    });

    it('sends allow_mcp only in plan mode', () => {
        assert.equal(toChatRequestBody(params({ mode: 'plan', allowMcp: true })).allow_mcp, true);
        assert.equal(toChatRequestBody(params({ mode: 'auto', allowMcp: true })).allow_mcp, undefined);
    });

    it('defaults allow_mcp to undefined (opt-in only) when not set', () => {
        assert.equal(toChatRequestBody(params({ mode: 'plan' })).allow_mcp, undefined);
    });
});
