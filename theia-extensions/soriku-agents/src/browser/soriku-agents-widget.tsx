/********************************************************************************
 * Soriku IDE — agents panel widget
 *
 * SPDX-License-Identifier: MIT
 ********************************************************************************/

import * as React from '@theia/core/shared/react';
import { inject, injectable, postConstruct } from '@theia/core/shared/inversify';
import { ReactWidget } from '@theia/core/lib/browser/widgets/react-widget';
import { CommandRegistry, MessageService } from '@theia/core/lib/common';
import { EngineClient } from 'soriku-engine-client-ext/lib/common/engine-client';
import { AgentItem, toAgentItems } from '../common/agent-view';
import { SorikuAgentSelectionService } from './soriku-agent-selection';

/** Command the chat extension (Phase 2.4) registers to open a chat for an agent id. */
export const SORIKU_CHAT_OPEN_COMMAND = 'soriku.chat.open';

/** Command the agent-customization extension (Phase 2.7) registers to edit an agent. */
export const SORIKU_AGENT_EDIT_COMMAND = 'soriku.agents.edit';

interface AgentsState {
    status: 'loading' | 'error' | 'ready';
    items: AgentItem[];
    error?: string;
}

@injectable()
export class SorikuAgentsWidget extends ReactWidget {

    static readonly ID = 'soriku-agents';
    static readonly LABEL = 'Soriku Agents';

    @inject(EngineClient)
    protected readonly engineClient: EngineClient;

    @inject(SorikuAgentSelectionService)
    protected readonly selection: SorikuAgentSelectionService;

    @inject(CommandRegistry)
    protected readonly commands: CommandRegistry;

    @inject(MessageService)
    protected readonly messages: MessageService;

    protected state: AgentsState = { status: 'loading', items: [] };

    @postConstruct()
    protected init(): void {
        this.id = SorikuAgentsWidget.ID;
        this.title.label = SorikuAgentsWidget.LABEL;
        this.title.caption = SorikuAgentsWidget.LABEL;
        this.title.iconClass = 'codicon codicon-organization';
        this.title.closable = true;
        this.node.tabIndex = 0;
        this.addClass('soriku-agents-widget');
        this.toDispose.push(this.selection.onDidChangeActive(() => this.update()));
        this.update();
        this.refresh();
    }

    async refresh(): Promise<void> {
        this.state = { status: 'loading', items: this.state.items };
        this.update();
        try {
            const response = await this.engineClient.listAgents();
            this.state = { status: 'ready', items: toAgentItems(response.data ?? []) };
        } catch (e) {
            this.state = { status: 'error', items: [], error: (e as Error).message };
        }
        this.update();
    }

    protected openChat(item: AgentItem): void {
        this.selection.setActive(item.id);
        if (this.commands.getCommand(SORIKU_CHAT_OPEN_COMMAND)) {
            this.commands.executeCommand(SORIKU_CHAT_OPEN_COMMAND, item.id);
        } else {
            this.messages.info(`Selected agent “${item.name}”. The chat view arrives in the next step.`);
        }
    }

    protected editAgent(item: AgentItem): void {
        if (this.commands.getCommand(SORIKU_AGENT_EDIT_COMMAND)) {
            this.commands.executeCommand(SORIKU_AGENT_EDIT_COMMAND, item.id);
        }
    }

    protected render(): React.ReactNode {
        return <div className='soriku-agents'>
            <div className='soriku-agents-header'>
                <span className='soriku-agents-title'>Agents</span>
                <button
                    className='theia-button secondary'
                    title='Refresh'
                    onClick={() => this.refresh()}
                >
                    <span className='codicon codicon-refresh' /> Refresh
                </button>
            </div>
            {this.renderBody()}
        </div>;
    }

    protected renderBody(): React.ReactNode {
        const { status, items, error } = this.state;
        if (status === 'loading' && items.length === 0) {
            return <div className='soriku-agents-message'>Loading agents…</div>;
        }
        if (status === 'error') {
            return <div className='soriku-agents-message soriku-agents-error'>
                <div>Could not load agents.</div>
                <div className='soriku-agents-error-detail'>{error}</div>
                <button className='theia-button' onClick={() => this.refresh()}>Retry</button>
            </div>;
        }
        if (items.length === 0) {
            return <div className='soriku-agents-message'>No agents found. Create one in Soriku, then refresh.</div>;
        }
        const activeId = this.selection.getActiveId();
        return <ul className='soriku-agents-list'>
            {items.map(item => this.renderAgent(item, item.id === activeId))}
        </ul>;
    }

    protected renderAgent(item: AgentItem, active: boolean): React.ReactNode {
        return <li
            key={item.id}
            className={`soriku-agent-item${active ? ' active' : ''}`}
        >
            <span
                className='soriku-agent-avatar'
                style={item.avatarColor ? { backgroundColor: item.avatarColor } : undefined}
            >{item.avatarText}</span>
            <div className='soriku-agent-body'>
                <div className='soriku-agent-name'>{item.name}</div>
                {item.role && <div className='soriku-agent-role'>{item.role}</div>}
                {item.description && <div className='soriku-agent-description'>{item.description}</div>}
            </div>
            <div className='soriku-agent-actions'>
                <button
                    className='theia-button'
                    title='Open chat'
                    onClick={() => this.openChat(item)}
                >Open chat</button>
                {this.commands.getCommand(SORIKU_AGENT_EDIT_COMMAND) && <button
                    className='theia-button secondary'
                    title='Edit agent'
                    onClick={() => this.editAgent(item)}
                >Edit</button>}
            </div>
        </li>;
    }
}
