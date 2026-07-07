/********************************************************************************
 * Soriku IDE — auth status model unit tests
 *
 * SPDX-License-Identifier: MIT
 ********************************************************************************/

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
    computeStatusView,
    normalizeAuthMode,
    parseDeepLinkToken,
    pickUserName,
} from '../common/auth-status';

describe('normalizeAuthMode', () => {
    it('maps known modes', () => {
        assert.equal(normalizeAuthMode('local'), 'local');
        assert.equal(normalizeAuthMode('simezu'), 'simezu');
    });
    it('falls back to unknown', () => {
        assert.equal(normalizeAuthMode(undefined), 'unknown');
        assert.equal(normalizeAuthMode('something-else'), 'unknown');
    });
});

describe('pickUserName', () => {
    it('prefers display_name, then name, email, user_id', () => {
        assert.equal(pickUserName({ display_name: 'Marten', name: 'm', email: 'e', user_id: 'u' }), 'Marten');
        assert.equal(pickUserName({ name: 'm', email: 'e' }), 'm');
        assert.equal(pickUserName({ email: 'e@x' }), 'e@x');
        assert.equal(pickUserName({ user_id: 'u-1' }), 'u-1');
    });
    it('returns undefined when nothing usable', () => {
        assert.equal(pickUserName(undefined), undefined);
        assert.equal(pickUserName({}), undefined);
        assert.equal(pickUserName({ name: '' }), undefined);
    });
});

describe('computeStatusView', () => {
    it('local mode needs no sign-in', () => {
        const view = computeStatusView({ mode: 'local', hasToken: false });
        assert.equal(view.text, 'Local mode');
    });

    it('simezu + token + user shows the user name', () => {
        const view = computeStatusView({ mode: 'simezu', hasToken: true, user: 'Marten' });
        assert.equal(view.text, 'Connected as Marten');
    });

    it('simezu + token without resolved user still shows connected', () => {
        const view = computeStatusView({ mode: 'simezu', hasToken: true });
        assert.equal(view.text, 'Connected to Simezu');
    });

    it('simezu without token prompts to connect', () => {
        const view = computeStatusView({ mode: 'simezu', hasToken: false });
        assert.equal(view.text, 'Connect to Simezu');
    });

    it('error takes precedence over connected (non-local)', () => {
        const view = computeStatusView({ mode: 'simezu', hasToken: true, user: 'Marten', error: 'Token rejected' });
        assert.equal(view.text, 'Soriku: auth error');
        assert.equal(view.tooltip, 'Token rejected');
    });

    it('local mode ignores a stale error', () => {
        const view = computeStatusView({ mode: 'local', hasToken: false, error: 'whatever' });
        assert.equal(view.text, 'Local mode');
    });

    it('unknown mode reports engine unknown', () => {
        const view = computeStatusView({ mode: 'unknown', hasToken: false });
        assert.equal(view.text, 'Soriku: engine unknown');
    });
});

describe('parseDeepLinkToken', () => {
    it('extracts the token from a real auth-callback deep link', () => {
        assert.equal(parseDeepLinkToken('soriku://auth-callback#token=sk-soriku-abc123'), 'sk-soriku-abc123');
    });

    it('ignores extra fragment params after the token', () => {
        assert.equal(parseDeepLinkToken('soriku://auth-callback#token=abc&foo=bar'), 'abc');
    });

    it('rejects a different host', () => {
        assert.equal(parseDeepLinkToken('soriku://something-else#token=abc'), undefined);
    });

    it('rejects a missing token', () => {
        assert.equal(parseDeepLinkToken('soriku://auth-callback#foo=bar'), undefined);
    });

    it('rejects a missing fragment entirely', () => {
        assert.equal(parseDeepLinkToken('soriku://auth-callback'), undefined);
    });

    it('rejects an empty token value', () => {
        assert.equal(parseDeepLinkToken('soriku://auth-callback#token='), undefined);
    });
});
