/********************************************************************************
 * Soriku IDE — workbench commands + Cursor-like keybindings
 *
 * SPDX-License-Identifier: MIT
 ********************************************************************************/

import { inject, injectable, postConstruct } from '@theia/core/shared/inversify';
import { Command, CommandContribution, CommandRegistry, MessageService } from '@theia/core/lib/common';
import { KeybindingContribution, KeybindingRegistry } from '@theia/core/lib/browser/keybinding';
import { QuickInputService } from '@theia/core/lib/browser';
import { ContextKey, ContextKeyService } from '@theia/core/lib/browser/context-key-service';
import { FrontendApplicationContribution } from '@theia/core/lib/browser/frontend-application-contribution';
import { EngineClient } from 'soriku-engine-client-ext/lib/common/engine-client';
import { SorikuAgentSelectionService } from 'soriku-agents-ext/lib/browser/soriku-agent-selection';
import { SorikuAgentCatalog } from 'soriku-agents-ext/lib/browser/soriku-agent-catalog';
import { buildAgentPickItems } from '../common/agent-pick';
import { SorikuInlineEditController } from './soriku-inline-edit-controller';
import { SorikuInlineEditWidget } from './soriku-inline-edit-widget';

export namespace SorikuWorkbenchCommands {
    const CATEGORY = 'Soriku';
    // Phase 6.5: renamed from 'soriku.inlineEdit.placeholder' — the command was
    // always fully wired (verified end to end: QuickInput -> proposeInlineEdit
    // -> review/accept/discard state machine), the id just read like a stub.
    export const INLINE_EDIT: Command = { id: 'soriku.inlineEdit.open', category: CATEGORY, label: 'Inline Edit' };
    export const SWITCH_AGENT: Command = { id: 'soriku.agents.switchActive', category: CATEGORY, label: 'Switch Active Agent' };
    export const INLINE_EDIT_NEXT: Command = { id: 'soriku.inlineEdit.next', category: CATEGORY, label: 'Inline Edit: Next Change' };
    export const INLINE_EDIT_PREVIOUS: Command = { id: 'soriku.inlineEdit.previous', category: CATEGORY, label: 'Inline Edit: Previous Change' };
    export const INLINE_EDIT_ACCEPT_ALL: Command = { id: 'soriku.inlineEdit.acceptAll', category: CATEGORY, label: 'Inline Edit: Accept All' };
    export const INLINE_EDIT_DISCARD: Command = { id: 'soriku.inlineEdit.discard', category: CATEGORY, label: 'Inline Edit: Discard' };
}

const CHAT_TOGGLE = 'soriku.chat.toggle';
const AGENTS_TOGGLE = 'soriku.agents.toggle';
const CHAT_OPEN = 'soriku.chat.open';
/** True only while the ⌘K review card is showing — scopes Tab/⇧Tab/⌘⏎/Esc so they don't shadow normal editing. */
const INLINE_EDIT_REVIEWING_KEY = 'soriku.inlineEdit.reviewing';

@injectable()
export class SorikuWorkbenchContribution implements CommandContribution, KeybindingContribution, FrontendApplicationContribution {

    @inject(EngineClient)
    protected readonly engineClient: EngineClient;

    @inject(SorikuAgentSelectionService)
    protected readonly selection: SorikuAgentSelectionService;

    @inject(SorikuAgentCatalog)
    protected readonly agentCatalog: SorikuAgentCatalog;

    @inject(QuickInputService)
    protected readonly quickInput: QuickInputService;

    @inject(MessageService)
    protected readonly messages: MessageService;

    @inject(CommandRegistry)
    protected readonly commands: CommandRegistry;

    @inject(ContextKeyService)
    protected readonly contextKeys: ContextKeyService;

    @inject(SorikuInlineEditController)
    protected readonly inlineEditController: SorikuInlineEditController;

    protected inlineEditReviewingKey: ContextKey<boolean>;
    protected inlineEditWidget: SorikuInlineEditWidget | undefined;

    @postConstruct()
    protected init(): void {
        this.inlineEditReviewingKey = this.contextKeys.createKey<boolean>(INLINE_EDIT_REVIEWING_KEY, false);
        this.inlineEditController.onDidChangeState(state => {
            this.inlineEditReviewingKey.set(state.kind === 'reviewing');
        });
    }

    onStart(): void {
        // One long-lived widget instance that re-anchors itself to whichever
        // editor is active whenever the controller enters "reviewing" — see
        // SorikuInlineEditWidget's own onDidChangeState subscription.
        this.inlineEditWidget = new SorikuInlineEditWidget(this.inlineEditController);
    }

    onStop(): void {
        this.inlineEditWidget?.dispose();
        this.inlineEditWidget = undefined;
    }

    registerCommands(commands: CommandRegistry): void {
        commands.registerCommand(SorikuWorkbenchCommands.INLINE_EDIT, {
            execute: () => this.inlineEditController.trigger(),
        });
        commands.registerCommand(SorikuWorkbenchCommands.SWITCH_AGENT, {
            execute: () => this.switchActiveAgent(),
        });
        commands.registerCommand(SorikuWorkbenchCommands.INLINE_EDIT_NEXT, {
            execute: () => this.inlineEditController.next(),
        });
        commands.registerCommand(SorikuWorkbenchCommands.INLINE_EDIT_PREVIOUS, {
            execute: () => this.inlineEditController.previous(),
        });
        commands.registerCommand(SorikuWorkbenchCommands.INLINE_EDIT_ACCEPT_ALL, {
            execute: () => this.inlineEditController.acceptAll(),
        });
        commands.registerCommand(SorikuWorkbenchCommands.INLINE_EDIT_DISCARD, {
            execute: () => this.inlineEditController.discard(),
        });
    }

    registerKeybindings(keybindings: KeybindingRegistry): void {
        keybindings.registerKeybindings(
            { command: CHAT_TOGGLE, keybinding: 'ctrlcmd+l' },
            { command: AGENTS_TOGGLE, keybinding: 'ctrlcmd+i' },
            // Cmd/Ctrl+K only inside the editor, to avoid shadowing global chord leaders.
            // Not scoped to "not reviewing": re-triggering ⌘K while a review card is
            // already open is fine (trigger() no-ops while state is 'requesting', and
            // otherwise just starts a fresh instruction over the same editor).
            { command: SorikuWorkbenchCommands.INLINE_EDIT.id, keybinding: 'ctrlcmd+k', when: 'editorTextFocus' },
            { command: SorikuWorkbenchCommands.SWITCH_AGENT.id, keybinding: 'ctrlcmd+shift+l' },
            { command: SorikuWorkbenchCommands.INLINE_EDIT_NEXT.id, keybinding: 'tab', when: INLINE_EDIT_REVIEWING_KEY },
            { command: SorikuWorkbenchCommands.INLINE_EDIT_PREVIOUS.id, keybinding: 'shift+tab', when: INLINE_EDIT_REVIEWING_KEY },
            { command: SorikuWorkbenchCommands.INLINE_EDIT_ACCEPT_ALL.id, keybinding: 'ctrlcmd+enter', when: INLINE_EDIT_REVIEWING_KEY },
            { command: SorikuWorkbenchCommands.INLINE_EDIT_DISCARD.id, keybinding: 'esc', when: INLINE_EDIT_REVIEWING_KEY },
        );
    }

    protected async switchActiveAgent(): Promise<void> {
        let items;
        try {
            // P3-c2: shared memoized catalog — no duplicate fetch next to the agents view.
            items = buildAgentPickItems(await this.agentCatalog.getAgents());
        } catch (e) {
            this.messages.error(`Could not load agents: ${(e as Error).message}`);
            return;
        }
        if (items.length === 0) {
            this.messages.info('No Soriku agents available.');
            return;
        }
        const pick = await this.quickInput.showQuickPick(
            items.map(item => ({ label: item.label, description: item.description, id: item.id })),
            { title: 'Switch active Soriku agent' },
        );
        if (pick?.id) {
            this.selection.setActive(pick.id);
            if (this.commands.getCommand(CHAT_OPEN)) {
                this.commands.executeCommand(CHAT_OPEN, pick.id);
            }
        }
    }
}
