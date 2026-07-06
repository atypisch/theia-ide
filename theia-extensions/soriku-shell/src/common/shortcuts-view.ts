/********************************************************************************
 * Soriku IDE — curated command list for the Keyboard Shortcuts overlay.
 * Labels/grouping are curated (like the mockup); the KEY shown for each is
 * always looked up live from the KeybindingRegistry, never hardcoded.
 *
 * SPDX-License-Identifier: MIT
 ********************************************************************************/

export interface ShortcutRow {
    label: string;
    /** Real, already-registered command id — looked up live, never a guessed string. */
    commandId: string;
}

export interface ShortcutGroup {
    title: string;
    items: ShortcutRow[];
}

export const SHORTCUT_GROUPS: ReadonlyArray<ShortcutGroup> = [
    {
        title: 'Soriku',
        items: [
            { label: 'Toggle chat', commandId: 'soriku.chat.toggle' },
            { label: 'Toggle agents panel', commandId: 'soriku.agents.toggle' },
            { label: 'Switch active agent', commandId: 'soriku.agents.switchActive' },
            { label: 'Open settings', commandId: 'soriku.settings.open' },
        ],
    },
    {
        title: 'General',
        items: [
            { label: 'Command palette', commandId: 'workbench.action.showCommands' },
            { label: 'Toggle terminal', commandId: 'workbench.action.terminal.toggleTerminal' },
            { label: 'About Soriku IDE', commandId: 'core.about' },
        ],
    },
];
