/********************************************************************************
 * Soriku IDE — global overlay host (Keyboard shortcuts, New window), 1:1 from
 * the mockup's OVERLAYS block. Rendered as a top-level React root, not a
 * Theia widget, since it needs an absolute full-viewport backdrop+frame.
 *
 * SPDX-License-Identifier: MIT
 ********************************************************************************/

import * as React from '@theia/core/shared/react';
import { Overlay } from 'soriku-theme-ext/lib/browser/ui';
import { SHORTCUT_GROUPS } from '../common/shortcuts-view';
import { SorikuOverlayKind } from './soriku-overlay-service';

export interface SorikuOverlayHostProps {
    kind: SorikuOverlayKind | undefined;
    onClose: () => void;
    /** Live keybinding text for a command id, e.g. "⌘L", or undefined if unbound. */
    keybindingFor: (commandId: string) => string | undefined;
    onOpenAllShortcuts: () => void;
    onConfirmNewWindow: () => void;
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
                {group.items.map(item => <div key={item.commandId} className='soriku-overlay-shortcuts-row'>
                    <span className='soriku-overlay-shortcuts-label'>{item.label}</span>
                    <span className='soriku-overlay-shortcuts-keys'>{props.keybindingFor(item.commandId) ?? '—'}</span>
                </div>)}
            </div>)}
        </div>
        <div className='soriku-overlay-shortcuts-footer'>
            <button className='soriku-overlay-link' onClick={props.onOpenAllShortcuts}>All keyboard shortcuts…</button>
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
            <button className='theia-button secondary' onClick={props.onClose}>Cancel</button>
            <button className='theia-button' onClick={props.onConfirmNewWindow}>Open window</button>
        </div>
    </div>;
}
