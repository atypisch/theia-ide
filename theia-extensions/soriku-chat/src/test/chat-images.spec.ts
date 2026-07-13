/********************************************************************************
 * Soriku IDE — chat image attachment unit tests
 *
 * SPDX-License-Identifier: MIT
 ********************************************************************************/

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
    MAX_ATTACHMENTS, MAX_SOURCE_BYTES, canAddAttachment, computeScaledSize, detectMimeTypeFromBase64,
    isSupportedImageType, stripDataUrlPrefix,
} from '../common/chat-images';

describe('computeScaledSize', () => {
    it('leaves a small image untouched', () => {
        assert.deepEqual(computeScaledSize(800, 600), { width: 800, height: 600 });
    });

    it('downscales a landscape image proportionally to the max edge', () => {
        const { width, height } = computeScaledSize(3456, 2022, 1568);
        assert.equal(width, 1568);
        assert.equal(height, Math.round(2022 * (1568 / 3456)));
    });

    it('downscales a portrait image proportionally to the max edge', () => {
        const { width, height } = computeScaledSize(2022, 3456, 1568);
        assert.equal(height, 1568);
        assert.equal(width, Math.round(2022 * (1568 / 3456)));
    });

    it('never upscales a small image', () => {
        assert.deepEqual(computeScaledSize(100, 50, 1568), { width: 100, height: 50 });
    });

    it('handles an extreme aspect ratio without a zero dimension', () => {
        const { width, height } = computeScaledSize(10000, 5, 1568);
        assert.equal(width, 1568);
        assert.ok(height >= 1);
    });

    it('floors dimensions at 1px', () => {
        const { width, height } = computeScaledSize(1, 1, 1568);
        assert.equal(width, 1);
        assert.equal(height, 1);
    });
});

describe('stripDataUrlPrefix', () => {
    it('strips a data: URL prefix', () => {
        assert.equal(stripDataUrlPrefix('data:image/jpeg;base64,ABC123'), 'ABC123');
    });

    it('leaves raw base64 unchanged', () => {
        assert.equal(stripDataUrlPrefix('ABC123'), 'ABC123');
    });
});

describe('isSupportedImageType', () => {
    it('accepts common image mime types', () => {
        assert.equal(isSupportedImageType('image/png'), true);
        assert.equal(isSupportedImageType('image/jpeg'), true);
        assert.equal(isSupportedImageType('image/webp'), true);
        assert.equal(isSupportedImageType('image/gif'), true);
    });

    it('accepts mixed casing', () => {
        assert.equal(isSupportedImageType('IMAGE/PNG'), true);
    });

    it('rejects non-image types', () => {
        assert.equal(isSupportedImageType('application/pdf'), false);
        assert.equal(isSupportedImageType('text/plain'), false);
    });
});

describe('canAddAttachment', () => {
    it('allows adding when under the count and size caps', () => {
        assert.deepEqual(canAddAttachment(0, 1024), { ok: true });
    });

    it('rejects at the attachment count cap', () => {
        const result = canAddAttachment(MAX_ATTACHMENTS, 1024);
        assert.equal(result.ok, false);
        assert.match(result.reason ?? '', /Up to 4 images/);
    });

    it('rejects a source file over the byte cap', () => {
        const result = canAddAttachment(0, MAX_SOURCE_BYTES + 1);
        assert.equal(result.ok, false);
        assert.match(result.reason ?? '', /20 MB/);
    });

    it('allows a source file exactly at the byte cap', () => {
        assert.equal(canAddAttachment(0, MAX_SOURCE_BYTES).ok, true);
    });
});

describe('detectMimeTypeFromBase64', () => {
    it('detects PNG from its magic-byte prefix', () => {
        assert.equal(detectMimeTypeFromBase64('iVBORw0KGgoAAAANSUhEUgAA'), 'image/png');
    });

    it('detects GIF from its magic-byte prefix', () => {
        assert.equal(detectMimeTypeFromBase64('R0lGODlhAQABAIAAAAAAAP'), 'image/gif');
    });

    it('detects WEBP (RIFF container) from its magic-byte prefix', () => {
        assert.equal(detectMimeTypeFromBase64('UklGRiIAAABXRUJQVlA4'), 'image/webp');
    });

    it('defaults to JPEG for anything else', () => {
        assert.equal(detectMimeTypeFromBase64('/9j/4AAQSkZJRgABAQ'), 'image/jpeg');
        assert.equal(detectMimeTypeFromBase64('unknown-prefix'), 'image/jpeg');
    });
});
