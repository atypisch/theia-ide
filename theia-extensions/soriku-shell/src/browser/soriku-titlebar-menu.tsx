/********************************************************************************
 * Soriku IDE — in-window File/Edit/View/Go/Run/Agents/Help menu, 1:1 from the
 * mockup's titlebar menu block. Every item invokes a real, already-registered
 * command; shortcut hints are looked up live from the KeybindingRegistry and
 * left blank (never guessed) when nothing is bound. Mockup items with no real
 * backing command (New Agent…, Run Tests, Approve Plan, Stop Fleet) are
 * omitted rather than wired to nothing — same precedent as the Agents grid's
 * intentionally-omitted "New agent" button.
 *
 * SPDX-License-Identifier: MIT
 ********************************************************************************/

import * as React from '@theia/core/shared/react';
import { createPortal } from '@theia/core/shared/react-dom';

export interface TitlebarMenuItem {
    label: string;
    commandId: string;
}

export interface TitlebarMenuSeparator {
    separator: true;
}

export type TitlebarMenuEntry = TitlebarMenuItem | TitlebarMenuSeparator;

export interface TitlebarMenuDef {
    label: string;
    items: TitlebarMenuEntry[];
}

export const TITLEBAR_MENUS: ReadonlyArray<TitlebarMenuDef> = [
    {
        label: 'File',
        items: [
            { label: 'New File…', commandId: 'soriku.overlay.newFile' },
            { label: 'New Window', commandId: 'soriku.overlay.newWindow' },
            { label: 'Open Folder…', commandId: 'workspace:openFolder' },
            { separator: true },
            { label: 'Save', commandId: 'core.save' },
            { label: 'Save All', commandId: 'core.saveAll' },
            { separator: true },
            { label: 'Close Editor', commandId: 'core.close.main.tab' },
        ],
    },
    {
        label: 'Edit',
        items: [
            { label: 'Undo', commandId: 'core.undo' },
            { label: 'Redo', commandId: 'core.redo' },
            { separator: true },
            { label: 'Cut', commandId: 'core.cut' },
            { label: 'Copy', commandId: 'core.copy' },
            { label: 'Paste', commandId: 'core.paste' },
            { separator: true },
            { label: 'Find', commandId: 'core.find' },
            { label: 'Find in Files…', commandId: 'search-in-workspace.open' },
        ],
    },
    {
        label: 'View',
        items: [
            { label: 'Command Palette…', commandId: 'workbench.action.showCommands' },
            { separator: true },
            { label: 'Explorer', commandId: 'fileNavigator:toggle' },
            { label: 'Agents', commandId: 'soriku.agents.toggle' },
            { label: 'Models', commandId: 'soriku.models.open' },
            { label: 'Capability Map', commandId: 'soriku.capabilityMap.open' },
            { separator: true },
            { label: 'Toggle Chat', commandId: 'core.toggle.right.panel' },
            { label: 'Toggle Terminal', commandId: 'workbench.action.terminal.toggleTerminal' },
            { label: 'Toggle Theme', commandId: 'soriku.theme.toggle' },
        ],
    },
    {
        label: 'Go',
        items: [
            { label: 'Go to File…', commandId: 'file-search.openFile' },
            { label: 'Go to Symbol…', commandId: 'editor.action.quickOutline' },
            { separator: true },
            { label: 'Back', commandId: 'textEditor.commands.go.back' },
            { label: 'Forward', commandId: 'textEditor.commands.go.forward' },
        ],
    },
    {
        label: 'Run',
        items: [
            { label: 'Run Task…', commandId: 'task:run' },
        ],
    },
    {
        label: 'Agents',
        items: [
            { label: 'Open Agents', commandId: 'soriku.agents.toggle' },
            { separator: true },
            { label: 'Manage Models', commandId: 'soriku.models.open' },
            { label: 'Capability Map', commandId: 'soriku.capabilityMap.open' },
            { label: 'Routing Overrides', commandId: 'soriku.routing.overrides.open' },
            { label: 'MCP Servers', commandId: 'soriku.mcp.open' },
        ],
    },
    {
        label: 'Help',
        items: [
            { label: 'Documentation', commandId: 'soriku.docs.open' },
            { label: 'Keyboard Shortcuts', commandId: 'soriku.overlay.shortcuts' },
            { separator: true },
            { label: 'About Soriku Code', commandId: 'core.about' },
        ],
    },
];

export interface SorikuTitlebarMenuProps {
    keybindingFor: (commandId: string) => string | undefined;
    executeCommand: (commandId: string) => void;
}

export function SorikuTitlebarMenu(props: SorikuTitlebarMenuProps): React.ReactElement {
    const [openMenu, setOpenMenu] = React.useState<string | undefined>(undefined);
    // eslint-disable-next-line no-null/no-null
    const rootRef = React.useRef<HTMLDivElement>(null);
    const buttonRefs = React.useRef<Map<string, HTMLButtonElement>>(new Map());
    const [dropdownPos, setDropdownPos] = React.useState<{ top: number; left: number }>({ top: 0, left: 0 });

    // The dropdown is portalled to document.body (see below) because the
    // titlebar row uses `overflow: hidden` for text-truncation elsewhere,
    // which would otherwise clip an absolutely-positioned child dropdown
    // even though its computed layout rect is correct — a real, verified
    // rendering bug, not just a styling nicety.
    React.useEffect(() => {
        if (!openMenu) {
            return undefined;
        }
        const onDocMouseDown = (e: MouseEvent): void => {
            const target = e.target as Element;
            const insideTrigger = rootRef.current?.contains(target as Node);
            const insideDropdown = target.closest('.soriku-titlebar-menu-dropdown');
            if (!insideTrigger && !insideDropdown) {
                setOpenMenu(undefined);
            }
        };
        document.addEventListener('mousedown', onDocMouseDown, true);
        return () => document.removeEventListener('mousedown', onDocMouseDown, true);
    }, [openMenu]);

    const openAt = (label: string): void => {
        const btn = buttonRefs.current.get(label);
        if (btn) {
            const rect = btn.getBoundingClientRect();
            setDropdownPos({ top: rect.bottom, left: rect.left });
        }
        setOpenMenu(label);
    };

    const invoke = (commandId: string): void => {
        setOpenMenu(undefined);
        props.executeCommand(commandId);
    };

    const activeMenu = TITLEBAR_MENUS.find(m => m.label === openMenu);

    return <div className='soriku-titlebar-menu' ref={rootRef}>
        {TITLEBAR_MENUS.map(menu => <div key={menu.label} className='soriku-titlebar-menu-item'>
            <button
                ref={el => { if (el) { buttonRefs.current.set(menu.label, el); } }}
                className={`soriku-titlebar-menu-label${openMenu === menu.label ? ' open' : ''}`}
                onClick={() => (openMenu === menu.label ? setOpenMenu(undefined) : openAt(menu.label))}
                onMouseEnter={() => { if (openMenu) { openAt(menu.label); } }}
            >
                {menu.label}
            </button>
        </div>)}
        {activeMenu && createPortal(
            <div className='soriku-titlebar-menu-dropdown' style={{ top: dropdownPos.top, left: dropdownPos.left }}>
                {activeMenu.items.map((entry, i) => 'separator' in entry
                    ? <div key={i} className='soriku-titlebar-menu-sep' />
                    : <button key={entry.label} className='soriku-titlebar-menu-row' onClick={() => invoke(entry.commandId)}>
                        <span className='soriku-titlebar-menu-row-label'>{entry.label}</span>
                        <span className='soriku-titlebar-menu-row-hint'>{props.keybindingFor(entry.commandId)}</span>
                    </button>)}
            </div>,
            document.body
        )}
    </div>;
}
