/********************************************************************************
 * Soriku IDE — Settings view helper tests
 *
 * SPDX-License-Identifier: MIT
 ********************************************************************************/

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { connectionLabel, countWarmModels, formatCostCap } from '../common/settings-view';

describe('formatCostCap', () => {
    it('shows the engine default for a negative cap', () => {
        assert.equal(formatCostCap(-1), 'Engine default');
    });
    it('formats a positive cap in euros', () => {
        assert.equal(formatCostCap(5), '€5.00');
        assert.equal(formatCostCap(0.5), '€0.50');
    });
    it('formats a zero cap (block all cloud spend) as a real amount, not the default', () => {
        assert.equal(formatCostCap(0), '€0.00');
    });
});

describe('countWarmModels', () => {
    it('counts running models against the total', () => {
        assert.deepEqual(countWarmModels([{ is_running: true }, { is_running: false }, { is_running: true }]), { warm: 2, total: 3 });
    });
    it('handles an empty list', () => {
        assert.deepEqual(countWarmModels([]), { warm: 0, total: 0 });
    });
    it('treats a missing is_running as not warm', () => {
        assert.deepEqual(countWarmModels([{}]), { warm: 0, total: 1 });
    });
});

describe('connectionLabel', () => {
    it('labels every known status', () => {
        assert.equal(connectionLabel('connected'), 'Connected');
        assert.equal(connectionLabel('connecting'), 'Connecting…');
        assert.equal(connectionLabel('unreachable'), 'Unreachable');
        assert.equal(connectionLabel('idle'), 'Not connected');
    });
    it('falls back to "Not connected" for an unknown status', () => {
        assert.equal(connectionLabel('bogus'), 'Not connected');
    });
});
