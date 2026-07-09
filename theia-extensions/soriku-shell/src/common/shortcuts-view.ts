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
    /**
     * Only for actions with no Theia-level command at all (Monaco's own
     * built-in inline-completion accept, bound internally by the editor
     * itself, not via KeybindingRegistry) — a fixed, well-known key that
     * cannot be looked up live because there is nothing to look up.
     */
    staticHint?: string;
}

export interface ShortcutGroup {
    title: string;
    items: ShortcutRow[];
}

/**
 * 1:1 the mockup's 4 groups (General/Files/Agents & chat/Editor). Every KEY
 * shown is looked up live from the real KeybindingRegistry (never hardcoded)
 * — so where the mockup assumed a binding this app doesn't actually have
 * (e.g. it assumes Command palette is ⌘K; here ⌘K is Inline Edit and the
 * palette is really ⌘⇧P), the real one is shown instead. Two mockup rows
 * (Approve plan ⌘⏎, Stop fleet ⌘.) are omitted entirely — those are plain
 * onClick handlers in the chat widget with no registered command/keybinding
 * of their own, so there is nothing real to look up for them.
 */
export const SHORTCUT_GROUPS: ReadonlyArray<ShortcutGroup> = [
    {
        title: 'General',
        items: [
            { label: 'Command palette', commandId: 'workbench.action.showCommands' },
            { label: 'Keyboard shortcuts', commandId: 'soriku.overlay.shortcuts' },
            { label: 'Settings', commandId: 'soriku.settings.open' },
            { label: 'Toggle terminal', commandId: 'workbench.action.terminal.toggleTerminal' },
        ],
    },
    {
        title: 'Files',
        items: [
            { label: 'New file', commandId: 'soriku.overlay.newFile' },
            { label: 'New window', commandId: 'workbench.action.newWindow' },
            { label: 'Go to file', commandId: 'file-search.openFile' },
            { label: 'Save', commandId: 'core.save' },
        ],
    },
    {
        title: 'Agents & chat',
        items: [
            { label: 'Focus chat', commandId: 'soriku.chat.toggle' },
            { label: 'Open agents', commandId: 'soriku.agents.toggle' },
            { label: 'Switch active agent', commandId: 'soriku.agents.switchActive' },
        ],
    },
    {
        title: 'Editor',
        items: [
            { label: 'Inline edit', commandId: 'soriku.inlineEdit.placeholder' },
            { label: 'Accept ghost-text', commandId: '', staticHint: 'Tab' },
            { label: 'Revert inline edit', commandId: 'soriku.inlineEdit.discard' },
            { label: 'Find', commandId: 'core.find' },
        ],
    },
];
