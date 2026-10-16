/********************************************************************************
 * Soriku IDE — chat display formatting helpers (pure)
 *
 * SPDX-License-Identifier: MIT
 ********************************************************************************/

/** "just now", "5m", "3h", "2d", else a short date — the compact time in the v2 history list. */
export function relativeTime(iso: string | undefined, now: Date = new Date()): string {
    if (!iso) { return ''; }
    const then = new Date(iso);
    if (Number.isNaN(then.getTime())) { return ''; }
    const s = Math.max(0, Math.round((now.getTime() - then.getTime()) / 1000));
    if (s < 45) { return 'just now'; }
    if (s < 3600) { return `${Math.round(s / 60)}m`; }
    if (s < 86400) { return `${Math.round(s / 3600)}h`; }
    if (s < 7 * 86400) { return `${Math.round(s / 86400)}d`; }
    return then.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

/** 108000 → "1m 48s"; 2500 → "2.5s"; below a second → "<1s". */
export function formatDuration(ms: number | undefined): string {
    if (ms === undefined || !Number.isFinite(ms) || ms < 0) { return ''; }
    if (ms < 1000) { return '<1s'; }
    if (ms < 10_000) { return `${(ms / 1000).toFixed(1)}s`; }
    const total = Math.round(ms / 1000);
    const m = Math.floor(total / 60);
    return m === 0 ? `${total}s` : `${m}m ${total % 60}s`;
}

/** "1 file" / "2 files". */
export function plural(n: number, one: string, many: string = `${one}s`): string {
    return `${n} ${n === 1 ? one : many}`;
}

/** `+18` / `−2` (a real minus sign, as in the design). */
export function signed(n: number | undefined, sign: '+' | '−'): string {
    return n === undefined ? '' : `${sign}${n}`;
}

/** Short model label for the line under a reply: "Auto → qwen2.5-coder:7b · local". */
export function modelLine(model: string | undefined, auto: boolean, local: boolean | undefined): string | undefined {
    if (!model) { return undefined; }
    const scope = local === undefined ? '' : local ? ' · local' : ' · cloud';
    return `${auto ? 'Auto → ' : ''}${model}${scope}`;
}

/** "14:22" in the user's locale (24h as in the design where the locale allows). */
export function clockTime(ms: number | undefined): string {
    if (ms === undefined || !Number.isFinite(ms)) { return ''; }
    return new Date(ms).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', hour12: false });
}

/** A stored title that is only the workspace line carries no information — show a neutral label. */
export function historyTitle(title: string | undefined): string {
    const t = (title ?? '').trim();
    return !t || /^workspace:/i.test(t) ? 'Untitled chat' : t;
}
