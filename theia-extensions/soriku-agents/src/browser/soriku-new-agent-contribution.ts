/********************************************************************************
 * Soriku IDE — "+ New agent" wizard (Phase 6.1)
 *
 * QuickInput flow: name -> category -> optional preferred model -> POST via
 * EngineClient.createAgent. `AgentCreateRequest` has no separate `category`
 * field — category is derived server-side from `role`, so the category step
 * sends its choice as `role` (matching how core/agents' default-agent
 * resolver already creates a fallback agent with `role: 'coding'`).
 *
 * Registers `soriku.agents.new`, invoked from the Agents panel header's
 * "+ New agent" button (replaces the "intentionally omitted" placeholder).
 *
 * SPDX-License-Identifier: MIT
 ********************************************************************************/

import { inject, injectable } from '@theia/core/shared/inversify';
import { Command, CommandContribution, CommandRegistry, MessageService } from '@theia/core/lib/common';
import { QuickInputService, QuickPickItem } from '@theia/core/lib/browser';
import { EngineClient } from 'soriku-engine-client-ext/lib/common/engine-client';
import { AgentCategory } from 'soriku-theme-ext/lib/browser/ui';
import { buildAgentCreateRequest } from '../common/new-agent-form';
import { SorikuAgentCatalog } from './soriku-agent-catalog';
import { SorikuAgentSelectionService } from './soriku-agent-selection';
import { SORIKU_CHAT_OPEN_COMMAND } from './soriku-agents-widget';

export namespace SorikuNewAgentCommands {
    export const OPEN: Command = { id: 'soriku.agents.new', category: 'Soriku', label: 'New Agent…' };
}

interface CategoryPickItem extends QuickPickItem {
    category: AgentCategory;
}

const CATEGORY_ITEMS: CategoryPickItem[] = [
    { label: 'Coding', description: 'Code generation, refactoring, debugging, review', category: 'coding' },
    { label: 'Reasoning', description: 'Chain-of-thought, architecture, complex analysis', category: 'reasoning' },
    { label: 'General', description: 'Chat, writing, translation, everyday tasks', category: 'general' },
];

const AUTO_MODEL_ID = '';

@injectable()
export class SorikuNewAgentContribution implements CommandContribution {

    @inject(CommandRegistry)
    protected readonly commands: CommandRegistry;

    @inject(QuickInputService)
    protected readonly quickInput: QuickInputService;

    @inject(EngineClient)
    protected readonly engineClient: EngineClient;

    @inject(MessageService)
    protected readonly messages: MessageService;

    @inject(SorikuAgentCatalog)
    protected readonly catalog: SorikuAgentCatalog;

    @inject(SorikuAgentSelectionService)
    protected readonly selection: SorikuAgentSelectionService;

    registerCommands(commands: CommandRegistry): void {
        commands.registerCommand(SorikuNewAgentCommands.OPEN, { execute: () => this.run() });
    }

    /** The full wizard. Any step returning undefined (user pressed Escape) quietly aborts. */
    protected async run(): Promise<void> {
        const name = await this.promptName();
        if (!name) {
            return;
        }
        const category = await this.promptCategory();
        if (!category) {
            return;
        }
        const preferredModel = await this.promptModel();

        try {
            const response = await this.engineClient.createAgent(
                buildAgentCreateRequest(name, category, preferredModel),
            );
            this.catalog.invalidate();
            this.messages.info(`Agent "${response.data.name}" created.`);
            this.selection.setActive(response.data.id, response.data.name, response.data.category);
            if (this.commands.getCommand(SORIKU_CHAT_OPEN_COMMAND)) {
                await this.commands.executeCommand(SORIKU_CHAT_OPEN_COMMAND, response.data.id);
            }
        } catch (e) {
            this.messages.error(`Could not create agent: ${(e as Error).message}`);
        }
    }

    protected promptName(): Promise<string | undefined> {
        return this.quickInput.input({
            title: 'New agent — name (1/3)',
            placeHolder: 'e.g. Koda, Review Bot, Docs Writer…',
            validateInput: async value => value.trim() ? undefined : 'A name is required.',
        });
    }

    protected async promptCategory(): Promise<AgentCategory | undefined> {
        const pick = await this.quickInput.showQuickPick(CATEGORY_ITEMS, {
            title: 'New agent — category (2/3)',
            placeholder: 'What is this agent mainly for?',
        });
        return (pick as CategoryPickItem | undefined)?.category;
    }

    /** Best-effort — model listing failing must never block agent creation, so this
     * resolves to "auto" (undefined preferred_model) rather than aborting the wizard. */
    protected async promptModel(): Promise<string | undefined> {
        let modelIds: string[];
        try {
            const response = await this.engineClient.listModels();
            modelIds = response.data.map(m => m.id);
        } catch {
            return AUTO_MODEL_ID;
        }
        const items: QuickPickItem[] = [
            { label: 'Auto', description: 'Let Soriku route per request', id: AUTO_MODEL_ID },
            ...modelIds.map(id => ({ label: id, id })),
        ];
        const pick = await this.quickInput.showQuickPick(items, {
            title: 'New agent — preferred model (3/3)',
            placeholder: 'Auto lets the router pick per request',
        });
        return pick?.id ?? AUTO_MODEL_ID;
    }
}
