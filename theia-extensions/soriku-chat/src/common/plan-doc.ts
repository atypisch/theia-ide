/********************************************************************************
 * Soriku IDE — plan document view-model helpers (pure)
 *
 * SPDX-License-Identifier: MIT
 ********************************************************************************/

import { plural } from './chat-format';

/** First markdown heading of the engine's plan document, else the first sentence of what the user asked. */
export function planTitle(document: string | undefined, userPrompt: string | undefined): string {
    const heading = /^\s{0,3}#{1,2}\s+(.+?)\s*#*\s*$/m.exec(document ?? '');
    const fromDoc = heading?.[1].replace(/[*_`]/g, '').trim();
    if (fromDoc && !/^(plan|execution plan)$/i.test(fromDoc)) { return clip(fromDoc, 80); }
    const ask = (userPrompt ?? '').replace(/^\s*workspace:[^\n]*\n+/i, '').replace(/\s+/g, ' ').trim();
    const first = ask.split(/(?<=[.!?])\s/)[0] ?? ask;
    return first ? clip(first, 80) : 'Plan';
}

function clip(text: string, max: number): string {
    return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

/** `Add local-first routing!` → `add-local-first-routing` — only for display in the header path. */
export function planSlug(title: string): string {
    const slug = title.toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 48);
    return slug || 'plan';
}

export interface PlanMetaInput {
    createdAt?: number;
    tasks: number;
    costEur?: number;
    clock: (ms: number | undefined) => string;
}

/** `14:22 today · 4 to-dos · est. €0.00` — only the parts that are actually known. */
export function planMeta(m: PlanMetaInput): string {
    const parts: string[] = [];
    if (m.createdAt !== undefined) { parts.push(`${m.clock(m.createdAt)} today`); }
    parts.push(plural(m.tasks, 'to-do'));
    if (typeof m.costEur === 'number') { parts.push(m.costEur === 0 ? '€0.00 · all local' : `est. €${m.costEur.toFixed(2)}`); }
    return parts.filter(Boolean).join(' · ');
}
