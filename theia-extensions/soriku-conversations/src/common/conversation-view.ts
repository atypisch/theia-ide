/********************************************************************************
 * Soriku IDE — conversation-history view helpers (pure, Theia-free, testable)
 *
 * SPDX-License-Identifier: MIT
 ********************************************************************************/

/** Compact relative age, e.g. "now", "5m", "3u", "2d". `nowMs` is injectable for tests. */
export function relativeAge(createdAtIso: string, nowMs: number): string {
    const then = Date.parse(createdAtIso);
    if (Number.isNaN(then)) {
        return '';
    }
    const sec = Math.max(0, Math.round((nowMs - then) / 1000));
    if (sec < 45) {
        return 'now';
    }
    const min = Math.round(sec / 60);
    if (min < 60) {
        return `${min}m`;
    }
    const hr = Math.round(min / 60);
    if (hr < 24) {
        return `${hr}u`;
    }
    const day = Math.round(hr / 24);
    return `${day}d`;
}

/** Trim the engine's bracketed mode prefix ("[Plan] …", "[Pilot] …") for display. */
export function cleanTitle(title: string): string {
    const t = (title || '').trim();
    return t.length > 0 ? t : 'Untitled conversation';
}
