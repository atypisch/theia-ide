/********************************************************************************
 * Soriku IDE — sidebar footer account view tests
 *
 * SPDX-License-Identifier: MIT
 ********************************************************************************/

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { sidebarAccountView } from '../common/sidebar-account-view';

describe('sidebarAccountView', () => {
    it('local mode shows the static Local · Free plan line', () => {
        const view = sidebarAccountView({ mode: 'local', hasToken: false });
        assert.equal(view.name, 'Account');
        assert.equal(view.subtitle, 'Local · Free plan');
    });

    it('connected simezu user with a resolved name shows initials + name', () => {
        const view = sidebarAccountView({ mode: 'simezu', hasToken: true, user: 'Marten Timan' });
        assert.equal(view.avatarText, 'MT');
        assert.equal(view.name, 'Marten Timan');
        assert.equal(view.subtitle, 'Connected to Simezu');
    });

    it('single-word name falls back to a two-letter slice', () => {
        const view = sidebarAccountView({ mode: 'simezu', hasToken: true, user: 'Marten' });
        assert.equal(view.avatarText, 'MA');
    });

    it('token present but user not yet resolved shows connecting', () => {
        const view = sidebarAccountView({ mode: 'simezu', hasToken: true });
        assert.equal(view.subtitle, 'Connecting…');
    });

    it('simezu mode without a token prompts to connect', () => {
        const view = sidebarAccountView({ mode: 'simezu', hasToken: false });
        assert.equal(view.subtitle, 'Connect to Simezu');
    });

    it('an error takes precedence over connected state', () => {
        const view = sidebarAccountView({ mode: 'simezu', hasToken: true, user: 'X', error: 'boom' });
        assert.equal(view.subtitle, 'Connection error');
    });

    it('unknown engine mode falls back to the local baseline', () => {
        const view = sidebarAccountView({ mode: 'unknown', hasToken: false });
        assert.equal(view.subtitle, 'Local · Free plan');
    });
});
