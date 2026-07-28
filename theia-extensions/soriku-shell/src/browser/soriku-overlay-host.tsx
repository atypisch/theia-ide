/********************************************************************************
 * Soriku IDE — global overlay host (Keyboard shortcuts, New window, New file,
 * Documentation), 1:1 from the mockup's OVERLAYS block. Rendered as a
 * top-level React root, not a Theia widget, since it needs an absolute
 * full-viewport backdrop+frame.
 *
 * SPDX-License-Identifier: MIT
 ********************************************************************************/

import * as React from '@theia/core/shared/react';
import { Btn, Overlay } from 'soriku-theme-ext/lib/browser/ui';
import { SHORTCUT_GROUPS } from '../common/shortcuts-view';
import { DOC_PAGES, DOCS_LAST_REVIEWED } from '../common/docs-content';
import { SorikuOverlayKind } from './soriku-overlay-service';

export interface SorikuOverlayHostProps {
    kind: SorikuOverlayKind | undefined;
    onClose: () => void;
    /** Live keybinding text for a command id, e.g. "⌘L", or undefined if unbound. */
    keybindingFor: (commandId: string) => string | undefined;
    onConfirmNewWindow: () => void;
    /** Creates a workspace-relative file and opens it. Returns an error message on failure. */
    onCreateFile: (relativePath: string) => Promise<string | undefined>;
}

export function SorikuOverlayHost(props: SorikuOverlayHostProps): React.ReactElement | null {
    const { kind, onClose } = props;
    if (!kind) {
        // eslint-disable-next-line no-null/no-null
        return null;
    }
    if (kind === 'shortcuts') {
        return <Overlay onClose={onClose} frameStyle={{ width: 640, maxWidth: '92vw' }}>
            {renderShortcuts(props)}
        </Overlay>;
    }
    if (kind === 'new-file') {
        return <Overlay onClose={onClose} frameStyle={{ width: 520, maxWidth: '92vw' }}>
            {renderNewFile(props)}
        </Overlay>;
    }
    if (kind === 'docs') {
        return <Overlay onClose={onClose} frameStyle={{ width: 860, maxWidth: '94vw', height: 'calc(100vh - 140px)' }}>
            {renderDocs(props)}
        </Overlay>;
    }
    return <Overlay onClose={onClose} frameStyle={{ width: 460, maxWidth: '92vw' }}>
        {renderNewWindow(props)}
    </Overlay>;
}

function renderShortcuts(props: SorikuOverlayHostProps): React.ReactElement {
    return <div className='soriku-overlay-shortcuts'>
        <div className='soriku-overlay-header'>
            <span className='soriku-overlay-title sk-em'>Keyboard shortcuts</span>
            <div className='soriku-overlay-header-spacer' />
            <button className='soriku-overlay-close' onClick={props.onClose} title='Close'>
                <span className='codicon codicon-close' />
            </button>
        </div>
        <div className='soriku-overlay-shortcuts-grid sk-scroll'>
            {SHORTCUT_GROUPS.map(group => <div key={group.title}>
                <div className='soriku-overlay-shortcuts-group-title'>{group.title}</div>
                {group.items.map(item => <div key={item.label} className='soriku-overlay-shortcuts-row'>
                    <span className='soriku-overlay-shortcuts-label'>{item.label}</span>
                    <span className='soriku-overlay-shortcuts-keys'>{item.staticHint ?? props.keybindingFor(item.commandId) ?? '—'}</span>
                </div>)}
            </div>)}
        </div>
    </div>;
}

function renderNewWindow(props: SorikuOverlayHostProps): React.ReactElement {
    return <div className='soriku-overlay-newwindow'>
        <div className='soriku-overlay-newwindow-icon'>
            <span className='codicon codicon-empty-window' />
        </div>
        <div className='soriku-overlay-newwindow-title'>Open a new window</div>
        <div className='soriku-overlay-newwindow-desc'>
            A second Soriku window opens on the same engine — separate tabs and chat, shared agents, models and fleet.
        </div>
        <div className='soriku-overlay-newwindow-actions'>
            <Btn variant='secondary' onClick={props.onClose}>Cancel</Btn>
            <Btn variant='primary' onClick={props.onConfirmNewWindow}>Open window</Btn>
        </div>
    </div>;
}

function renderNewFile(props: SorikuOverlayHostProps): React.ReactElement {
    const [path, setPath] = React.useState('');
    const [error, setError] = React.useState<string | undefined>(undefined);
    const [creating, setCreating] = React.useState(false);
    // eslint-disable-next-line no-null/no-null
    const inputRef = React.useRef<HTMLInputElement>(null);

    React.useEffect(() => {
        inputRef.current?.focus();
    }, []);

    const submit = async (): Promise<void> => {
        const trimmed = path.trim();
        if (!trimmed || creating) {
            return;
        }
        setCreating(true);
        const result = await props.onCreateFile(trimmed);
        setCreating(false);
        if (result) {
            setError(result);
        }
    };

    return <div className='soriku-overlay-newfile'>
        <div className='soriku-overlay-newfile-header'>
            <span className='codicon codicon-new-file soriku-overlay-newfile-icon' />
            <input
                ref={inputRef}
                className='soriku-overlay-newfile-input'
                placeholder='agents/new_module.py'
                value={path}
                onChange={e => { setPath(e.target.value); setError(undefined); }}
                onKeyDown={e => { if (e.key === 'Enter') { submit(); } }}
            />
        </div>
        {error
            ? <div className='soriku-overlay-newfile-error'>{error}</div>
            : <div className='soriku-overlay-newfile-hint'>Type a path and press Enter to create the file in the workspace.</div>}
        <div className='soriku-overlay-newfile-actions'>
            <Btn variant='secondary' onClick={props.onClose}>Cancel</Btn>
            <Btn variant='primary' onClick={() => submit()} disabled={!path.trim() || creating}>
                {creating ? 'Creating…' : 'Create file'}
            </Btn>
        </div>
    </div>;
}

function renderDocs(props: SorikuOverlayHostProps): React.ReactElement {
    const [activeSlug, setActiveSlug] = React.useState(DOC_PAGES[0].slug);
    const page = DOC_PAGES.find(p => p.slug === activeSlug) ?? DOC_PAGES[0];
    return <div className='soriku-overlay-docs'>
        <div className='soriku-overlay-docs-nav'>
            <div className='soriku-overlay-docs-nav-header'>
                <div className='soriku-overlay-docs-nav-title'>Docs</div>
                <span className='soriku-overlay-docs-offline-pill'>offline</span>
            </div>
            {DOC_PAGES.map(p => <button
                key={p.slug}
                className={`soriku-overlay-docs-nav-item${p.slug === activeSlug ? ' active' : ''}`}
                onClick={() => setActiveSlug(p.slug)}
            >
                {p.label}
            </button>)}
            <div className='soriku-overlay-docs-nav-footer'>
                Same source as soriku.com/docs — cached locally, works offline.
                <br />
                Content reviewed {DOCS_LAST_REVIEWED} — may lag the engine you're actually running.
            </div>
        </div>
        <div className='soriku-overlay-docs-content'>
            <div className='soriku-overlay-header'>
                <span className='soriku-overlay-docs-eyebrow'>Documentation</span>
                <div className='soriku-overlay-header-spacer' />
                <button className='soriku-overlay-close' onClick={props.onClose} title='Close'>
                    <span className='codicon codicon-close' />
                </button>
            </div>
            <div className='soriku-overlay-docs-body sk-scroll'>
                {page.blocks.map((block, i) => {
                    if (block.kind === 'h') {
                        return <h1 key={i} className='soriku-overlay-docs-h sk-em'>{block.text}</h1>;
                    }
                    if (block.kind === 'h2') {
                        return <h2 key={i} className='soriku-overlay-docs-h2'>{block.text}</h2>;
                    }
                    if (block.kind === 'code') {
                        return <pre key={i} className='soriku-overlay-docs-code'>{block.text}</pre>;
                    }
                    return <p key={i} className='soriku-overlay-docs-p'>{block.text}</p>;
                })}
            </div>
        </div>
    </div>;
}
