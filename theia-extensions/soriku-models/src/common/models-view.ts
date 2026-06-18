/********************************************************************************
 * Soriku IDE — model-management view helpers (pure, Theia-free, testable)
 *
 * SPDX-License-Identifier: MIT
 ********************************************************************************/

import { SorikuSseEvent } from 'soriku-engine-client-ext/lib/common/engine-types';

/** Human-readable model size, e.g. 4.4 → "4.4 GB". */
export function formatModelSize(sizeGb: number | undefined): string {
    if (!sizeGb || sizeGb <= 0) {
        return '';
    }
    return `${sizeGb.toFixed(1)} GB`;
}

export interface PullProgress {
    /** Short status message ("pulling manifest", "downloading", "success"…). */
    message: string;
    /** 0–100 when the engine reports byte progress, else undefined. */
    percent?: number;
    done: boolean;
    error?: string;
}

function asString(value: unknown): string | undefined {
    return typeof value === 'string' ? value : undefined;
}

function asNumber(value: unknown): number | undefined {
    return typeof value === 'number' ? value : undefined;
}

/** Fold one Ollama-pull SSE event into progress (status + optional byte percent). */
export function parsePullEvent(event: SorikuSseEvent): PullProgress {
    const error = asString(event.error);
    if (error) {
        return { message: error, done: true, error };
    }
    const status = asString(event.status) ?? asString(event.message) ?? '';
    const completed = asNumber(event.completed);
    const total = asNumber(event.total);
    let percent: number | undefined;
    if (completed !== undefined && total && total > 0) {
        percent = Math.max(0, Math.min(100, Math.round((completed / total) * 100)));
    }
    const done = event.done === true || /^success\b/i.test(status) || status === 'done';
    return { message: status || (done ? 'done' : 'working…'), percent, done };
}

/** A model id is local (Ollama) when it carries no known provider prefix. */
export function isRemoteModelId(modelId: string, remoteProviderNames: string[]): boolean {
    const idx = modelId.indexOf(':');
    if (idx <= 0) {
        return false;
    }
    return remoteProviderNames.includes(modelId.slice(0, idx));
}

/** Validate an Ollama model name to pull (e.g. "llama3.2" or "qwen2.5-coder:7b"). */
export function isValidOllamaName(name: string): boolean {
    return /^[a-zA-Z0-9][\w.-]*(?::[\w.-]+)?(?:\/[\w.-]+)?$/.test(name.trim()) && name.trim().length > 0;
}
