/********************************************************************************
 * Soriku IDE — MCP servers model tests (Theia-free, node --test)
 *
 * SPDX-License-Identifier: MIT
 ********************************************************************************/

import * as assert from 'assert';
import { describe, it } from 'node:test';
import {
    emptyDraft, validateDraft, draftToServer, healthLabel, isHealthy,
} from '../common/mcp-servers';

describe('validateDraft', () => {
    it('rejects an empty name', () => {
        const r = validateDraft({ ...emptyDraft(), command: 'npx' });
        assert.strictEqual(r.ok, false);
    });

    it('rejects an invalid name', () => {
        const r = validateDraft({ ...emptyDraft(), name: 'a b', command: 'npx' });
        assert.strictEqual(r.ok, false);
    });

    it('rejects a duplicate name', () => {
        const r = validateDraft({ ...emptyDraft(), name: 'gh', command: 'npx' }, ['gh']);
        assert.strictEqual(r.ok, false);
    });

    it('requires a command for stdio', () => {
        const r = validateDraft({ ...emptyDraft(), name: 'gh', transport: 'stdio' });
        assert.strictEqual(r.ok, false);
    });

    it('requires an http url for sse', () => {
        const r = validateDraft({ ...emptyDraft(), name: 'gh', transport: 'sse', url: 'ftp://x' });
        assert.strictEqual(r.ok, false);
    });

    it('accepts a valid stdio draft', () => {
        const r = validateDraft({ ...emptyDraft(), name: 'gh', transport: 'stdio', command: 'npx' });
        assert.strictEqual(r.ok, true);
    });

    it('accepts a valid sse draft', () => {
        const r = validateDraft({ ...emptyDraft(), name: 'gh', transport: 'sse', url: 'https://h/sse' });
        assert.strictEqual(r.ok, true);
    });
});

describe('draftToServer', () => {
    it('splits stdio args on whitespace', () => {
        const s = draftToServer({ ...emptyDraft(), name: 'gh', transport: 'stdio', command: 'npx', args: '-y  @scope/server' });
        assert.strictEqual(s.command, 'npx');
        assert.deepStrictEqual(s.args, ['-y', '@scope/server']);
        assert.strictEqual(s.url, undefined);
    });

    it('carries the url for sse and no command', () => {
        const s = draftToServer({ ...emptyDraft(), name: 'gh', transport: 'sse', url: 'https://h/sse' });
        assert.strictEqual(s.url, 'https://h/sse');
        assert.strictEqual(s.command, undefined);
    });

    it('passes requires_confirmation through', () => {
        const s = draftToServer({ ...emptyDraft(), name: 'gh', command: 'npx', requiresConfirmation: false });
        assert.strictEqual(s.requires_confirmation, false);
    });
});

describe('health helpers', () => {
    it('labels ok / error / unknown', () => {
        assert.strictEqual(healthLabel({ gh: 'ok' }, 'gh'), 'connected');
        assert.ok(healthLabel({ gh: 'refused' }, 'gh').startsWith('error:'));
        assert.strictEqual(healthLabel({}, 'gh'), 'unknown');
    });

    it('isHealthy only for ok', () => {
        assert.strictEqual(isHealthy({ gh: 'ok' }, 'gh'), true);
        assert.strictEqual(isHealthy({ gh: 'boom' }, 'gh'), false);
    });
});
