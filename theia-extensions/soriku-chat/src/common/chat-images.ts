/********************************************************************************
 * Soriku IDE — chat image attachments (pure, Theia-free, unit-testable)
 *
 * SPDX-License-Identifier: MIT
 ********************************************************************************/

/** Long-edge cap for attached images, matching Anthropic's optimal vision edge. */
export const MAX_IMAGE_EDGE = 1568;
export const JPEG_QUALITY = 0.85;
export const MAX_ATTACHMENTS = 4;
export const MAX_SOURCE_BYTES = 20 * 1024 * 1024;

const SUPPORTED_IMAGE_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif']);

export interface ChatImageAttachment {
    id: string;
    /** Base64-encoded JPEG, WITHOUT the `data:` prefix — the engine wire format. */
    base64: string;
    mimeType: 'image/jpeg';
    width: number;
    height: number;
    name?: string;
}

/** Proportional resize to fit within maxEdge on the long side; never upscales. */
export function computeScaledSize(width: number, height: number, maxEdge: number = MAX_IMAGE_EDGE): { width: number; height: number } {
    const longEdge = Math.max(width, height);
    if (longEdge <= maxEdge) {
        return { width: Math.max(1, Math.round(width)), height: Math.max(1, Math.round(height)) };
    }
    const scale = maxEdge / longEdge;
    return {
        width: Math.max(1, Math.round(width * scale)),
        height: Math.max(1, Math.round(height * scale)),
    };
}

/** Strips a `data:<mime>;base64,` prefix, if present, returning the raw base64 payload. */
export function stripDataUrlPrefix(dataUrl: string): string {
    const commaIndex = dataUrl.indexOf(',');
    return dataUrl.startsWith('data:') && commaIndex >= 0 ? dataUrl.slice(commaIndex + 1) : dataUrl;
}

export function isSupportedImageType(mimeType: string): boolean {
    return SUPPORTED_IMAGE_TYPES.has(mimeType.toLowerCase());
}

/** Whether one more attachment can be added, given the current count and its source byte size. */
export function canAddAttachment(currentCount: number, sourceBytes: number): { ok: boolean; reason?: string } {
    if (currentCount >= MAX_ATTACHMENTS) {
        return { ok: false, reason: `Up to ${MAX_ATTACHMENTS} images per message.` };
    }
    if (sourceBytes > MAX_SOURCE_BYTES) {
        return { ok: false, reason: `Image is larger than ${Math.round(MAX_SOURCE_BYTES / (1024 * 1024))} MB.` };
    }
    return { ok: true };
}

/**
 * Best-effort mime type from a raw base64 payload's magic-byte prefix, for
 * rendering thumbnails of images restored from conversation history (the
 * engine stores bare base64, no mime type). Defaults to JPEG — this IDE's own
 * uploads always re-encode to JPEG (see chat-image-processor.ts).
 */
export function detectMimeTypeFromBase64(base64: string): string {
    if (base64.startsWith('iVBORw0KGgo')) {
        return 'image/png';
    }
    if (base64.startsWith('R0lGOD')) {
        return 'image/gif';
    }
    if (base64.startsWith('UklGR')) {
        return 'image/webp';
    }
    return 'image/jpeg';
}
