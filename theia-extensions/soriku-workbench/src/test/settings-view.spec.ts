/********************************************************************************
 * Soriku IDE — Settings view helper tests
 *
 * SPDX-License-Identifier: MIT
 ********************************************************************************/

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { connectionLabel, countWarmModels, engineErrorMessage, featureLabel, formatCostCap } from '../common/settings-view';

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

describe('featureLabel', () => {
    it('title-cases the first word and lowercases the rest', () => {
        assert.equal(featureLabel('priority_routing'), 'Priority routing');
        assert.equal(featureLabel('local_models'), 'Local models');
    });
    it('handles a single word', () => {
        assert.equal(featureLabel('hosted'), 'Hosted');
    });
});

describe('engineErrorMessage', () => {
    it('prefers the parsed error body message when present', () => {
        const err = Object.assign(new Error('HTTP 400 for /api/billing/checkout'), { body: { error: 'simezu_not_configured', message: 'Simezu billing is niet geconfigureerd' } });
        assert.equal(engineErrorMessage(err), 'Simezu billing is niet geconfigureerd');
    });
    it('falls back to the error message when there is no body', () => {
        assert.equal(engineErrorMessage(new Error('network down')), 'network down');
    });
    it('falls back to String() for a non-Error throw', () => {
        assert.equal(engineErrorMessage('oops'), 'oops');
    });
});
