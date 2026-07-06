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
import { AgentAvatar, AgentCategory, Badge, Btn, Card } from 'soriku-theme-ext/lib/browser/ui';
import { AgentItem, toAgentItems } from '../common/agent-view';
import { SorikuAgentSelectionService } from './soriku-agent-selection';
import { SorikuAgentCatalog } from './soriku-agent-catalog';

/** Engine categories are free-text; fall back to 'general' for anything unrecognized. */
function toKnownCategory(category: string): AgentCategory {
    return category === 'coding' || category === 'reasoning' || category === 'general' ? category : 'general';
}

type AgentFilter = 'all' | AgentCategory;
const AGENT_FILTERS: ReadonlyArray<{ value: AgentFilter; label: string }> = [
    { value: 'all', label: 'All' },
    { value: 'coding', label: 'Coding' },
    { value: 'reasoning', label: 'Reasoning' },
    { value: 'general', label: 'General' },
];

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

    @inject(SorikuAgentCatalog)
    protected readonly catalog: SorikuAgentCatalog;

    @inject(SorikuAgentSelectionService)
    protected readonly selection: SorikuAgentSelectionService;

    @inject(CommandRegistry)
    protected readonly commands: CommandRegistry;

    @inject(MessageService)
    protected readonly messages: MessageService;

    protected state: AgentsState = { status: 'loading', items: [] };
    protected categoryFilter: AgentFilter = 'all';

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

    async refresh(force = false): Promise<void> {
        this.state = { status: 'loading', items: this.state.items };
        this.update();
        try {
            // P3-c2: served from the startup-prefetched catalog — instant on a warm
            // memo; force=true (the Refresh button) bypasses it.
            const agents = await this.catalog.getAgents(force);
            this.state = { status: 'ready', items: toAgentItems(agents) };
        } catch (e) {
            this.state = { status: 'error', items: [], error: (e as Error).message };
        }
        this.update();
    }

    protected openChat(item: AgentItem): void {
        this.selection.setActive(item.id, item.name);
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
                <div className='soriku-agents-header-main'>
                    <div className='soriku-agents-eyebrow'><span className='soriku-agents-eyebrow-dot' />Personas</div>
                    <div className='soriku-agents-heading'>Your <span className='sk-em'>agents</span></div>
                    <div className='soriku-agents-subhead'>Persistent identities with memory, tone and specialism. Work with a team, not raw models.</div>
                </div>
                <div className='soriku-agents-header-actions'>
                    {this.renderFilters()}
                    {/* No "New agent" flow exists yet in the engine/IDE — the mockup's create
                        button is intentionally omitted rather than wired to nothing. Refresh
                        (not present in the static mockup, which has no live data to refresh)
                        is kept as a small icon-only affordance instead of inventing a full button. */}
                    <button className='soriku-agents-refresh-icon' title='Refresh' onClick={() => this.refresh(true)}>
                        <span className='codicon codicon-refresh' />
                    </button>
                </div>
            </div>
            {this.renderBody()}
        </div>;
    }

    protected renderFilters(): React.ReactNode {
        const { items } = this.state;
        const counts: Record<AgentFilter, number> = { all: items.length, coding: 0, reasoning: 0, general: 0 };
        for (const item of items) {
            counts[toKnownCategory(item.category)]++;
        }
        return <div className='soriku-agents-filters'>
            {AGENT_FILTERS.map(f => (
                <button
                    key={f.value}
                    className={`soriku-agents-filter${this.categoryFilter === f.value ? ' active' : ''}`}
                    onClick={() => { this.categoryFilter = f.value; this.update(); }}
                >
                    {f.label}<span className='soriku-agents-filter-count'>{counts[f.value]}</span>
                </button>
            ))}
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
        const visible = this.categoryFilter === 'all' ? items : items.filter(i => toKnownCategory(i.category) === this.categoryFilter);
        const activeId = this.selection.getActiveId();
        return <div className='soriku-agents-grid'>
            {visible.map(item => this.renderAgent(item, item.id === activeId))}
        </div>;
    }

    protected renderAgent(item: AgentItem, active: boolean): React.ReactNode {
        const category = toKnownCategory(item.category);
        return <Card key={item.id} className={`soriku-agent-card${active ? ' active' : ''}`}>
            <div className='soriku-agent-card-head'>
                <AgentAvatar initials={item.avatarText} category={category} size='md' />
                <div className='soriku-agent-card-title'>
                    <div className='soriku-agent-name'>{item.name}</div>
                    {item.category && <Badge tone='acc'>{item.category}</Badge>}
                </div>
            </div>
            {item.description && <div className='soriku-agent-description'>{item.description}</div>}
            {item.skills.length > 0 && <div className='soriku-agent-skills'>
                {item.skills.map(skill => <Badge key={skill}>{skill}</Badge>)}
            </div>}
            <div className='soriku-agent-card-footer'>
                {item.preferredModel && <span className='soriku-agent-model'>{item.preferredModel}</span>}
                <span className='soriku-agent-card-spacer' />
                <Btn variant='primary' onClick={() => this.openChat(item)}>Open chat</Btn>
                {this.commands.getCommand(SORIKU_AGENT_EDIT_COMMAND) && <Btn variant='secondary' onClick={() => this.editAgent(item)}>Edit</Btn>}
            </div>
        </Card>;
    }
}
