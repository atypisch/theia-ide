/********************************************************************************
 * Soriku IDE — docs overlay content sanity checks (Phase 6.3 staleness note)
 *
 * SPDX-License-Identifier: MIT
 ********************************************************************************/

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { DOC_PAGES, DOCS_LAST_REVIEWED } from '../common/docs-content';

describe('docs-content', () => {
    it('DOCS_LAST_REVIEWED is a real YYYY-MM-DD date', () => {
        assert.match(DOCS_LAST_REVIEWED, /^\d{4}-\d{2}-\d{2}$/);
        assert.ok(!Number.isNaN(Date.parse(DOCS_LAST_REVIEWED)), `${DOCS_LAST_REVIEWED} does not parse as a date`);
    });

    it('every page has a slug, label, and at least one block', () => {
        assert.ok(DOC_PAGES.length > 0);
        for (const page of DOC_PAGES) {
            assert.ok(page.slug.trim(), 'page missing a slug');
            assert.ok(page.label.trim(), `page ${page.slug} missing a label`);
            assert.ok(page.blocks.length > 0, `page ${page.slug} has no content blocks`);
        }
    });

    it('page slugs are unique', () => {
        const slugs = DOC_PAGES.map(p => p.slug);
        assert.equal(new Set(slugs).size, slugs.length);
    });
});
