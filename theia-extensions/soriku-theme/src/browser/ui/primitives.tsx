/********************************************************************************
 * Soriku IDE — shared UI primitives (1:1 from the mockup), reused across all
 * soriku-* extensions: pills, badges, toggles, pickers, buttons, cards, dots.
 *
 * SPDX-License-Identifier: MIT
 ********************************************************************************/

import * as React from '@theia/core/shared/react';

/** Rounded pill wrapper, e.g. "Local mode · connected" in the titlebar. */
export function Pill({ children, tone = 'default' }: {
    children: React.ReactNode;
    tone?: 'default' | 'ok' | 'warn' | 'danger' | 'acc';
}): React.ReactNode {
    return <span className={`sk-pill sk-pill-${tone}`}>{children}</span>;
}

/** Small uppercase category/role tag, e.g. "CODING". */
export function Badge({ children, tone = 'default' }: {
    children: React.ReactNode;
    tone?: 'default' | 'ok' | 'warn' | 'danger' | 'acc';
}): React.ReactNode {
    return <span className={`sk-badge sk-badge-${tone}`}>{children}</span>;
}

/** Read-only value shown as a filled pill, e.g. "http://127.0.0.1:8765" in Settings. */
export function PillValue({ children }: { children: React.ReactNode }): React.ReactNode {
    return <span className="sk-pill-value">{children}</span>;
}

/** On/off toggle. `locked` renders the always-off "locked off" telemetry-style variant. */
export function Toggle({ on, locked, onChange }: {
    on: boolean;
    locked?: boolean;
    onChange?: (next: boolean) => void;
}): React.ReactNode {
    if (locked) {
        return (
            <span className="sk-toggle-locked">
                <span className="sk-toggle-locked-label">locked off</span>
                <span className="sk-toggle sk-toggle-off sk-toggle-disabled">
                    <span className="sk-toggle-knob" />
                </span>
            </span>
        );
    }
    return (
        <span
            className={`sk-toggle ${on ? 'sk-toggle-on' : 'sk-toggle-off'}`}
            onClick={() => onChange?.(!on)}
            role="switch"
            aria-checked={on}
        >
            <span className="sk-toggle-knob" />
        </span>
    );
}

export interface SegmentedOption<T extends string> {
    value: T;
    label: string;
}

/** The DO / MODEL / ROUTE pickers under the chat input. */
export function SegmentedPicker<T extends string>({ options, value, onChange }: {
    options: ReadonlyArray<SegmentedOption<T>>;
    value: T;
    onChange: (next: T) => void;
}): React.ReactNode {
    return (
        <span className="sk-segmented">
            {options.map(opt => (
                <span
                    key={opt.value}
                    className={`sk-segmented-item ${opt.value === value ? 'sk-segmented-item-active' : ''}`}
                    onClick={() => onChange(opt.value)}
                >
                    {opt.label}
                </span>
            ))}
        </span>
    );
}

/** Primary/secondary/ghost button, e.g. "Approve & run" / "Cancel". */
export function Btn({ children, variant = 'primary', onClick, disabled }: {
    children: React.ReactNode;
    variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
    onClick?: () => void;
    disabled?: boolean;
}): React.ReactNode {
    return (
        <button className={`sk-btn sk-btn-${variant}`} onClick={onClick} disabled={disabled}>
            {children}
        </button>
    );
}

/** Worker/fleet status dot — pulses while running. */
export function StatusDot({ status }: { status: 'running' | 'done' | 'error' | 'idle' }): React.ReactNode {
    return <span className={`sk-dot sk-dot-${status}`} />;
}

/** The "verified ✓" / "fixing" pill on tool calls and minion rows. */
export function VerifyPill({ state }: { state: 'verified' | 'fixing' | 'blocked' | 'denied' }): React.ReactNode {
    const labels: Record<typeof state, string> = {
        verified: 'verified ✓',
        fixing: 'fixing',
        blocked: 'blocked',
        denied: 'denied',
    };
    return <span className={`sk-verify-pill sk-verify-pill-${state}`}>{labels[state]}</span>;
}

/** Additions/deletions bar for a generated file row, e.g. router.py +18 −2. */
export function DiffBar({ added, removed }: { added: number; removed: number }): React.ReactNode {
    const total = Math.max(added + removed, 1);
    const addPct = (added / total) * 100;
    return (
        <span className="sk-diffbar">
            <span className="sk-diffbar-add" style={{ width: `${addPct}%` }} />
            <span className="sk-diffbar-del" style={{ width: `${100 - addPct}%` }} />
        </span>
    );
}

/** Generic bordered card container (plan-approval, fleet, tool-call, insights, …). */
export function Card({ children, className = '' }: { children: React.ReactNode; className?: string }): React.ReactNode {
    return <div className={`sk-card ${className}`}>{children}</div>;
}
