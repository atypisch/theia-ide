/********************************************************************************
 * Soriku IDE — browser-side image decode/downscale for chat attachments
 *
 * SPDX-License-Identifier: MIT
 ********************************************************************************/

import { ChatImageAttachment, JPEG_QUALITY, computeScaledSize, stripDataUrlPrefix } from '../common/chat-images';

let nextId = 0;

/** Decodes, downscales and JPEG-encodes an image blob into a wire-ready attachment. */
export async function processImageBlob(blob: Blob, name?: string): Promise<ChatImageAttachment> {
    let bitmap: ImageBitmap;
    try {
        bitmap = await createImageBitmap(blob);
    } catch {
        throw new Error(`Could not read "${name ?? 'image'}" — is it a valid image file?`);
    }
    try {
        const { width, height } = computeScaledSize(bitmap.width, bitmap.height);
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
            throw new Error('Could not process the image (no 2D canvas context available).');
        }
        ctx.drawImage(bitmap, 0, 0, width, height);
        const dataUrl = canvas.toDataURL('image/jpeg', JPEG_QUALITY);
        return {
            id: `img-${++nextId}-${Date.now()}`,
            base64: stripDataUrlPrefix(dataUrl),
            mimeType: 'image/jpeg',
            width,
            height,
            name,
        };
    } finally {
        bitmap.close();
    }
}
