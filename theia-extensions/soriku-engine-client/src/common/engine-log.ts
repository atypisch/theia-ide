/********************************************************************************
 * Soriku IDE — engine log line formatting (pure)
 *
 * SPDX-License-Identifier: MIT
 ********************************************************************************/

/** One short line per engine event for the "Soriku Engine" output channel. */
const DETAIL_KEYS = ['model', 'role', 'tool', 'goal', 'status', 'reason', 'message', 'error', 'content'];

function clip(text: string, max: number): string {
    const one = text.replace(/\s+/g, ' ').trim();
    return one.length > max ? `${one.slice(0, max - 1)}…` : one;
}

/**
 * `HH:MM:SS  plan_sse/worker_start  qwen2.5-coder:7b · backend-developer`.
 * Streaming text chunks and heartbeats are skipped (undefined) so the log stays readable.
 */
export function formatEngineLogLine(data: Record<string, unknown>, now: Date = new Date()): string | undefined {
    const type = typeof data.type === 'string' ? data.type : undefined;
    if (!type || type === 'chunk' || type === 'worker_chunk' || type === 'synthesis_chunk' || type === 'heartbeat') {
        return undefined;
    }
    const channel = typeof data.channel === 'string' ? data.channel : 'engine';
    const details: string[] = [];
    for (const key of DETAIL_KEYS) {
        const v = data[key];
        if (typeof v === 'string' && v.trim()) { details.push(clip(v, 90)); }
        if (details.length === 3) { break; }
    }
    const time = [now.getHours(), now.getMinutes(), now.getSeconds()].map(n => String(n).padStart(2, '0')).join(':');
    return `${time}  ${channel}/${type}${details.length ? `  ${details.join(' · ')}` : ''}`;
}
