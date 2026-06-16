/********************************************************************************
 * Soriku IDE — workbench commands + Cursor-like keybindings
 *
 * SPDX-License-Identifier: MIT
 ********************************************************************************/

import { inject, injectable } from '@theia/core/shared/inversify';
import { Command, CommandContribution, CommandRegistry, MessageService } from '@theia/core/lib/common';
import { KeybindingContribution, KeybindingRegistry } from '@theia/core/lib/browser/keybinding';
import { QuickInputService } from '@theia/core/lib/browser';
import { EngineClient } from 'soriku-engine-client-ext/lib/common/engine-client';
import { SorikuAgentSelectionService } from 'soriku-agents-ext/lib/browser/soriku-agent-selection';
import { buildAgentPickItems } from '../common/agent-pick';

export namespace SorikuWorkbenchCommands {
    const CATEGORY = 'Soriku';
    export const INLINE_EDIT: Command = { id: 'soriku.inlineEdit.placeholder', category: CATEGORY, label: 'Inline Edit' };
    export const SWITCH_AGENT: Command = { id: 'soriku.agents.switchActive', category: CATEGORY, label: 'Switch Active Agent' };
}

const CHAT_TOGGLE = 'soriku.chat.toggle';
const AGENTS_TOGGLE = 'soriku.agents.toggle';
const CHAT_OPEN = 'soriku.chat.open';

@injectable()
export class SorikuWorkbenchContribution implements CommandContribution, KeybindingContribution {

    @inject(EngineClient)
    protected readonly engineClient: EngineClient;

    @inject(SorikuAgentSelectionService)
    protected readonly selection: SorikuAgentSelectionService;

    @inject(QuickInputService)
    protected readonly quickInput: QuickInputService;

    @inject(MessageService)
    protected readonly messages: MessageService;

    @inject(CommandRegistry)
    protected readonly commands: CommandRegistry;

    registerCommands(commands: CommandRegistry): void {
        commands.registerCommand(SorikuWorkbenchCommands.INLINE_EDIT, {
            execute: () => this.messages.info('Inline edit is coming soon — use the Soriku chat for now.'),
        });
        commands.registerCommand(SorikuWorkbenchCommands.SWITCH_AGENT, {
            execute: () => this.switchActiveAgent(),
        });
    }

    registerKeybindings(keybindings: KeybindingRegistry): void {
        keybindings.registerKeybindings(
            { command: CHAT_TOGGLE, keybinding: 'ctrlcmd+l' },
            { command: AGENTS_TOGGLE, keybinding: 'ctrlcmd+i' },
            // Cmd/Ctrl+K only inside the editor, to avoid shadowing global chord leaders.
            { command: SorikuWorkbenchCommands.INLINE_EDIT.id, keybinding: 'ctrlcmd+k', when: 'editorTextFocus' },
            { command: SorikuWorkbenchCommands.SWITCH_AGENT.id, keybinding: 'ctrlcmd+shift+l' },
        );
    }

    protected async switchActiveAgent(): Promise<void> {
        let items;
        try {
            const response = await this.engineClient.listAgents();
            items = buildAgentPickItems(response.data ?? []);
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
