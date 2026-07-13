/********************************************************************************
 * Soriku IDE — chat panel maximize sizing unit tests
 *
 * SPDX-License-Identifier: MIT
 ********************************************************************************/

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { MAIN_AREA_MARGIN, MIN_MAXIMIZED_WIDTH, maximizedPanelWidth } from '../common/panel-sizing';

describe('maximizedPanelWidth', () => {
    it('takes ~78% of a wide window', () => {
        assert.equal(maximizedPanelWidth(1920), 1498);
    });

    it('scales down proportionally for a smaller window', () => {
        assert.equal(maximizedPanelWidth(1280), 998);
        assert.equal(maximizedPanelWidth(900), 702);
    });

    it('never drops below the minimum width when the window allows it', () => {
        assert.ok(maximizedPanelWidth(700) >= MIN_MAXIMIZED_WIDTH);
    });

    it('never exceeds windowWidth - MAIN_AREA_MARGIN, even on a narrow window', () => {
        for (const width of [1920, 1280, 900, 600, 500]) {
            assert.ok(maximizedPanelWidth(width) <= width - MAIN_AREA_MARGIN);
        }
    });

    it('returns whole-pixel integers', () => {
        assert.equal(Number.isInteger(maximizedPanelWidth(1337)), true);
    });
});
