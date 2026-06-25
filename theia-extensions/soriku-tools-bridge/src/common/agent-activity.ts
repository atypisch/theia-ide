/********************************************************************************
 * Soriku IDE — parse agent tool events for live activity UI
 *
 * SPDX-License-Identifier: MIT
 ********************************************************************************/

import { SorikuSseEvent } from 'soriku-engine-client-ext/lib/common/engine-types';
import { getStringArg } from './tool-delegation';

export interface WriteActivity {
    tool: 'file_write' | 'apply_patch';
    path: string;
    size?: number;
    preview?: string;
}

const WRITE_TOOLS = new Set(['file_write', 'apply_patch']);

export function extractWriteActivity(event: SorikuSseEvent): WriteActivity | undefined {
    const tool = typeof event.tool === 'string' ? event.tool : '';
    if (!WRITE_TOOLS.has(tool)) {
        return undefined;
    }
    const args = event.args && typeof event.args === 'object'
        ? event.args as Record<string, unknown>
        : {};
    const path = getStringArg(args, 'path');
    if (!path) {
        return undefined;
    }
    const content = getStringArg(args, 'content')
        ?? getStringArg(args, 'patch')
        ?? '';
    const lines = content ? content.split('\n').length : undefined;
    const preview = content
        ? content.split('\n').slice(0, 12).join('\n') + (content.split('\n').length > 12 ? '\n…' : '')
        : undefined;
    return {
        tool: tool as WriteActivity['tool'],
        path,
        size: lines,
        preview,
    };
}

export function shouldRevealWrite(event: SorikuSseEvent): boolean {
    if (event.error) {
        return false;
    }
    return extractWriteActivity(event) !== undefined;
}
