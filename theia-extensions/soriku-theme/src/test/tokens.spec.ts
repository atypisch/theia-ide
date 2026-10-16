/********************************************************************************
 * Soriku IDE — tokens test
 *
 * SPDX-License-Identifier: MIT
 ********************************************************************************/

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'fs';
import * as path from 'path';

/** Values copied from `Soriku IDE v2.dc.html` l.15-38 — the design source of truth. */
const DARK: Record<string, string> = {
    '--bg': '#0E0C09', '--bg-el': '#181510', '--bg-sunk': '#060503', '--hover': '#221E18', '--raise': '#211C16',
    '--ink': '#F2EDDF', '--ink2': '#BFB8A6', '--ink3': '#7A7468', '--line': '#2A2520', '--line2': '#3A342B',
    '--acc': '#FF8A3D', '--acc2': '#FFB066', '--on-acc': '#15120E',
    '--ok': '#5BC388', '--warn': '#E8A53F', '--danger': '#E8704D',
    '--cat-code': '#FF8A3D', '--cat-reason': '#8C8CF0', '--cat-general': '#54C2A8', '--add': '#5BC388',
};
const LIGHT: Record<string, string> = {
    '--bg': '#FBFAF6', '--bg-el': '#FFFFFF', '--bg-sunk': '#F3EFE6', '--hover': '#F1ECE0', '--raise': '#FFFFFF',
    '--ink': '#15120E', '--ink2': '#4A463D', '--ink3': '#847E70', '--line': '#E8E2D3', '--line2': '#D5CDB9',
    '--acc': '#E85D1F', '--acc2': '#FF8A3D', '--on-acc': '#FFFFFF',
    '--ok': '#2F7F4F', '--warn': '#B97C0F', '--danger': '#B7331F',
    '--cat-code': '#E85D1F', '--cat-reason': '#6E4FE8', '--cat-general': '#2F8F73', '--add': '#2F7F4F',
};
const RADII_SHADOWS: Record<string, string> = {
    '--r': '10px', '--rs': '6px', '--r-bubble': '12px', '--r-pop': '11px', '--r-modal': '14px',
    '--shadow-pop': '0 20px 50px -18px rgba(0, 0, 0, .55)',
    '--shadow-modal': '0 40px 90px -30px rgba(0, 0, 0, .7)',
    '--shadow-menu': '0 24px 60px -24px rgba(0, 0, 0, .6)',
};

const css = fs.readFileSync(path.join(__dirname, '../../src/browser/style/soriku-tokens.css'), 'utf8');

/** Extracts `--name: value;` declarations from the first block whose selector matches. */
function block(selector: RegExp): Record<string, string> {
    const m = selector.exec(css);
    assert.ok(m, `selector ${selector} not found`);
    const body = css.slice(m.index + m[0].length, css.indexOf('}', m.index));
    const out: Record<string, string> = {};
    for (const d of body.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) { out[d[1]] = d[2].trim(); }
    return out;
}

describe('soriku tokens match the v2 design', () => {
    it('dark theme', () => {
        const got = block(/^:root\s*\{/m);
        for (const [k, v] of Object.entries(DARK)) { assert.equal(got[k]?.toUpperCase(), v, k); }
    });
    it('light theme', () => {
        const got = block(/^:root\.soriku-light,\s*\nbody\.soriku-light\s*\{/m);
        for (const [k, v] of Object.entries(LIGHT)) { assert.equal(got[k]?.toUpperCase(), v, k); }
    });
    it('radii and shadows', () => {
        const got = block(/^:root\s*\{/m);
        for (const [k, v] of Object.entries(RADII_SHADOWS)) { assert.equal(got[k], v, k); }
    });
});
