/********************************************************************************
 * Soriku IDE — drop zone shown while the chat header is dragged (v2 l.108-115):
 * "Drop to open chat as a tab" over the editor area, or "Dock chat to the side"
 * along the right edge when the chat already is a tab.
 *
 * SPDX-License-Identifier: MIT
 ********************************************************************************/

export interface DropZoneOptions {
    /** Area the zone covers, in viewport coordinates. */
    rect: { left: number; top: number; width: number; height: number };
    label: string;
    onDrop: () => void;
}

/** Shows the zone and returns a function that removes it. Safe to call the remover twice. */
export function showChatDropZone(options: DropZoneOptions): () => void {
    const zone = document.createElement('div');
    zone.className = 'sk-dropzone';
    zone.textContent = options.label;
    Object.assign(zone.style, {
        left: `${options.rect.left}px`, top: `${options.rect.top}px`,
        width: `${options.rect.width}px`, height: `${options.rect.height}px`,
    });
    zone.addEventListener('dragover', e => { e.preventDefault(); zone.classList.add('hot'); });
    zone.addEventListener('dragleave', () => zone.classList.remove('hot'));
    zone.addEventListener('drop', e => { e.preventDefault(); options.onDrop(); });
    document.body.appendChild(zone);
    return () => zone.remove();
}

/** Right-edge strip used to dock the chat back to the side panel. */
export function rightEdgeRect(viewportWidth: number, viewportHeight: number, top: number): DropZoneOptions['rect'] {
    const width = Math.max(220, Math.round(viewportWidth * 0.28));
    return { left: viewportWidth - width, top, width, height: viewportHeight - top };
}
