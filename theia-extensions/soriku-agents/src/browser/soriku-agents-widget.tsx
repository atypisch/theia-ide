/********************************************************************************
 * Soriku IDE — agents panel widget
 *
 * SPDX-License-Identifier: MIT
 ********************************************************************************/

import * as React from '@theia/core/shared/react';
import { inject, injectable, postConstruct } from '@theia/core/shared/inversify';
import { ReactWidget } from '@theia/core/lib/browser/widgets/react-widget';
import { CommandRegistry, MessageService, PreferenceService } from '@theia/core/lib/common';
import { EngineClient } from 'soriku-engine-client-ext/lib/common/engine-client';
import { AgentAvatar, AgentCategory, Btn, categoryColors, toKnownCategory } from 'soriku-theme-ext/lib/browser/ui';
import { LearningSummary, summarizeLearning } from 'soriku-agent-customization-ext/lib/common/agent-form';
import { AgentItem, toAgentItems } from '../common/agent-view';
import { SorikuAgentSelectionService } from './soriku-agent-selection';
import { SorikuAgentCatalog } from './soriku-agent-catalog';
import { SorikuDefaultAgentResolver } from './soriku-default-agent-resolver';
import { SORIKU_DEFAULT_AGENT_ID } from './soriku-agents-preferences';

const DETAIL_TABS = ['Persona', 'Specialisms', 'Memory', 'Activity'] as const;

interface DetailState {
    status: 'loading' | 'error' | 'ready';
    learning?: LearningSummary;
    error?: string;
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

    @inject(SorikuDefaultAgentResolver)
    protected readonly defaultAgentResolver: SorikuDefaultAgentResolver;

    @inject(PreferenceService)
    protected readonly preferences: PreferenceService;

    protected state: AgentsState = { status: 'loading', items: [] };
    protected categoryFilter: AgentFilter = 'all';
    protected detailAgentId: string | undefined;
    protected detailState: DetailState | undefined;
    protected detailTab: typeof DETAIL_TABS[number] = 'Persona';

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
        this.toDispose.push(this.preferences.onPreferenceChanged(e => {
            if (e.preferenceName === SORIKU_DEFAULT_AGENT_ID) {
                this.update();
            }
        }));
        this.update();
        this.refresh();
    }

    async refresh(force = false): Promise<void> {
        this.state = { status: 'loading', items: this.state.items };
        this.update();
        try {
            // P3-c2: served from the startup-prefetched catalog — instant on a warm
            // memo; force=true (the Refresh button) bypasses it.
            let agents = await this.catalog.getAgents(force);
            if (agents.length === 0) {
                // A fresh install has zero agents — never dead-end here; the same
                // resolver the chat panel uses will auto-create "Koda" (dedupes by
                // name on the engine side, so this is safe to call unconditionally).
                await this.defaultAgentResolver.ensureActiveAgent();
                this.catalog.invalidate();
                agents = await this.catalog.getAgents(true);
            }
            const items = toAgentItems(agents);
            this.state = { status: 'ready', items };
            if (!this.detailAgentId || !items.some(i => i.id === this.detailAgentId)) {
                const preselect = items.find(i => i.id === this.selection.getActiveId()) ?? items[0];
                if (preselect) {
                    await this.selectForDetail(preselect);
                    return;
                }
            }
        } catch (e) {
            this.state = { status: 'error', items: [], error: (e as Error).message };
        }
        this.update();
    }

    protected openChat(item: AgentItem): void {
        this.selection.setActive(item.id, item.name, item.category, item.avatarColor);
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

    protected async setAsDefault(item: AgentItem): Promise<void> {
        await this.defaultAgentResolver.setDefaultAgent(item.id);
        this.messages.info(`“${item.name}” is now the default agent — used automatically when no agent is active.`);
        this.update();
    }

    /** Selects a card for the master-detail panel and loads its real learning summary. */
    protected async selectForDetail(item: AgentItem): Promise<void> {
        this.detailAgentId = item.id;
        this.detailTab = 'Persona';
        this.detailState = { status: 'loading' };
        this.update();
        try {
            const response = await this.engineClient.getAgent(item.id);
            this.detailState = { status: 'ready', learning: summarizeLearning(response.data) };
        } catch (e) {
            this.detailState = { status: 'error', error: (e as Error).message };
        }
        this.update();
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
                    {/* Phase 6.1: the mockup's create button, now wired to the
                        name -> category -> model QuickInput wizard (soriku.agents.new). */}
                    {this.commands.getCommand('soriku.agents.new') && <Btn
                        variant='secondary'
                        title='Create a new agent'
                        onClick={() => this.commands.executeCommand('soriku.agents.new')}
                    ><span className='codicon codicon-add' /> New agent</Btn>}
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
                <Btn variant='secondary' onClick={() => this.refresh()}>Retry</Btn>
            </div>;
        }
        if (items.length === 0) {
            return <div className='soriku-agents-message'>No agents found. Create one in Soriku, then refresh.</div>;
        }
        const visible = this.categoryFilter === 'all' ? items : items.filter(i => toKnownCategory(i.category) === this.categoryFilter);
        const selected = items.find(i => i.id === this.detailAgentId);
        return <div className='soriku-agents-split'>
            <div className='soriku-agents-grid-wrap sk-scroll'>
                <div className='soriku-agents-grid'>
                    {visible.map(item => this.renderAgent(item, item.id === this.detailAgentId))}
                </div>
            </div>
            {selected && this.renderDetailPanel(selected)}
        </div>;
    }

    /**
     * 1:1 the mockup's card: plain uppercase category text (not a Badge pill), no
     * per-card buttons — clicking selects the card for the master-detail panel.
     * Skills chips and Open-chat/Edit actions moved into that panel instead.
     */
    protected renderAgent(item: AgentItem, active: boolean): React.ReactNode {
        const category = toKnownCategory(item.category);
        return <div
            key={item.id}
            className={`soriku-agent-card${active ? ' active' : ''}`}
            onClick={() => this.selectForDetail(item)}
        >
            <div className='soriku-agent-card-head'>
                <AgentAvatar initials={item.avatarText} category={category} size='md' />
                <div className='soriku-agent-card-title'>
                    <div className='soriku-agent-name'>{item.name}</div>
                    {item.category && <div className='soriku-agent-card-category' style={{ color: categoryColors(category).c }}>{item.category}</div>}
                </div>
            </div>
            {item.description && <div className='soriku-agent-description'>{item.description}</div>}
            <div className='soriku-agent-card-footer'>
                {item.preferredModel && <span className='soriku-agent-model'>{item.preferredModel}</span>}
            </div>
        </div>;
    }

    /**
     * Master-detail panel, 1:1 the mockup (392px, right of the grid). "Allowed
     * tools" is now real (persisted per-agent tool_whitelist, editable in
     * soriku-agent-edit-widget.tsx) — shown read-only in the Persona tab
     * instead of the mockup's per-tool toggle switches, since editing lives
     * in the dedicated edit form. "runs this week"/"verified clean" stat
     * tiles are replaced with real equivalents this agent's own learning
     * data actually has: lifetime interaction count and positive-feedback
     * ratio (reusing summarizeLearning(), the same parsing already used by
     * the agent editor's "What this agent has learned" section) — not a
     * time-windowed run count or a "clean" verdict, since neither exists as
     * real data.
     */
    protected renderDetailPanel(item: AgentItem): React.ReactNode {
        const category = toKnownCategory(item.category);
        const d = this.detailState;
        const l = d?.status === 'ready' ? d.learning : undefined;
        const positivePct = l && (l.positive + l.negative) > 0 ? Math.round((l.positive / (l.positive + l.negative)) * 100) : undefined;
        const catColors = categoryColors(category);
        const isDefault = item.id === this.defaultAgentResolver.getDefaultAgentId();
        return <div className='soriku-agent-detail sk-scroll'>
            <div className='soriku-agent-detail-header'>
                <div className='soriku-agent-detail-head-row'>
                    <AgentAvatar initials={item.avatarText} category={category} size='lg' />
                    <div className='soriku-agent-detail-title'>
                        <div className='soriku-agent-detail-name'>{item.name}</div>
                        <div className='soriku-agent-detail-meta'>
                            {item.category && <span className='soriku-agent-detail-cat' style={{ color: catColors.c, background: catColors.bg }}>{item.category}</span>}
                            {item.preferredModel && <span className='soriku-agent-detail-model'>{item.preferredModel}</span>}
                            {isDefault && <span className='soriku-agent-detail-default-badge'>
                                <span className='codicon codicon-star-full' />Default
                            </span>}
                        </div>
                    </div>
                </div>
                <div className='soriku-agent-detail-actions'>
                    <Btn variant='primary' onClick={() => this.openChat(item)}>
                        <span className='codicon codicon-comment' />Open chat
                    </Btn>
                    {this.commands.getCommand(SORIKU_AGENT_EDIT_COMMAND) && <Btn variant='secondary' onClick={() => this.editAgent(item)}>Edit</Btn>}
                    <Btn variant='secondary' disabled={isDefault} onClick={() => this.setAsDefault(item)}>
                        <span className='codicon codicon-star-empty' />{isDefault ? 'Default agent' : 'Set as default'}
                    </Btn>
                </div>
            </div>
            <div className='soriku-agent-detail-tabs'>
                {DETAIL_TABS.map(tab => <button
                    key={tab}
                    className={`soriku-agent-detail-tab${this.detailTab === tab ? ' active' : ''}`}
                    onClick={() => { this.detailTab = tab; this.update(); }}
                >{tab}</button>)}
            </div>
            <div className='soriku-agent-detail-body'>
                {this.detailTab === 'Persona' && this.renderPersonaTab(item)}
                {this.detailTab === 'Specialisms' && this.renderSpecialismsTab(item)}
                {this.detailTab === 'Memory' && this.renderMemoryTab(d, l)}
                {this.detailTab === 'Activity' && this.renderActivityTab(d, l, positivePct)}
            </div>
        </div>;
    }

    protected renderPersonaTab(item: AgentItem): React.ReactNode {
        if (!item.description && !item.systemPrompt && item.toolWhitelist.length === 0) {
            return <div className='soriku-agent-detail-note'>No persona details set for this agent.</div>;
        }
        return <>
            {item.description && <div className='soriku-agent-detail-section'>
                <div className='soriku-agent-detail-section-title'>Description</div>
                <div className='soriku-agent-detail-note'>{item.description}</div>
            </div>}
            {item.systemPrompt && <div className='soriku-agent-detail-section'>
                <div className='soriku-agent-detail-section-title'>System prompt</div>
                <div className='soriku-agent-detail-prompt'>{item.systemPrompt}</div>
            </div>}
            {item.toolWhitelist.length > 0 && <div className='soriku-agent-detail-section'>
                <div className='soriku-agent-detail-section-title'>Allowed tools</div>
                <div className='soriku-agent-detail-skills'>
                    {item.toolWhitelist.map(tool => <span key={tool} className='soriku-agent-detail-skill'>{tool}</span>)}
                </div>
            </div>}
        </>;
    }

    protected renderSpecialismsTab(item: AgentItem): React.ReactNode {
        if (item.skills.length === 0) {
            return <div className='soriku-agent-detail-note'>No specialisms configured for this agent.</div>;
        }
        return <div className='soriku-agent-detail-section'>
            <div className='soriku-agent-detail-section-title'>Specialisms</div>
            <div className='soriku-agent-detail-skills'>
                {item.skills.map(skill => <span key={skill} className='soriku-agent-detail-skill'>{skill}</span>)}
            </div>
        </div>;
    }

    protected renderMemoryTab(d: DetailState | undefined, l: LearningSummary | undefined): React.ReactNode {
        if (d?.status === 'loading') {
            return <div className='soriku-agent-detail-note'>Loading memory…</div>;
        }
        if (d?.status === 'error') {
            return <div className='soriku-agent-detail-note'>Could not load memory: {d.error}</div>;
        }
        const empty = !l || (l.feedbackRules.length === 0 && l.qualityScores.length === 0 && l.stack.length === 0);
        if (empty) {
            return <div className='soriku-agent-detail-note'>No learning yet — give the agent feedback (👍/👎) in chat.</div>;
        }
        return <>
            {l.feedbackRules.length > 0 && <div className='soriku-agent-detail-section'>
                <div className='soriku-agent-detail-section-title'>Rules learned from feedback</div>
                <ul className='soriku-agent-detail-list'>{l.feedbackRules.map((r, i) => <li key={i}>{r}</li>)}</ul>
            </div>}
            {l.qualityScores.length > 0 && <div className='soriku-agent-detail-section'>
                <div className='soriku-agent-detail-section-title'>Quality by category</div>
                <ul className='soriku-agent-detail-list'>{l.qualityScores.map((q, i) =>
                    <li key={i}>{q.category}: {Math.round(q.ratio * 100)}% positive ({q.count})</li>)}</ul>
            </div>}
            {l.stack.length > 0 && <div className='soriku-agent-detail-section'>
                <div className='soriku-agent-detail-section-title'>Detected stack</div>
                <div className='soriku-agent-detail-note'>{l.stack.join(', ')}</div>
            </div>}
        </>;
    }

    protected renderActivityTab(d: DetailState | undefined, l: LearningSummary | undefined, positivePct: number | undefined): React.ReactNode {
        if (d?.status === 'loading') {
            return <div className='soriku-agent-detail-note'>Loading activity…</div>;
        }
        if (d?.status === 'error') {
            return <div className='soriku-agent-detail-note'>Could not load activity: {d.error}</div>;
        }
        if (!l || (l.interactions === 0 && positivePct === undefined)) {
            return <div className='soriku-agent-detail-note'>No activity yet.</div>;
        }
        return <div className='soriku-agent-detail-stats'>
            <div className='soriku-agent-detail-stat'>
                <div className='soriku-agent-detail-stat-value'>{l.interactions}</div>
                <div className='soriku-agent-detail-stat-label'>interactions</div>
            </div>
            {positivePct !== undefined && <div className='soriku-agent-detail-stat'>
                <div className='soriku-agent-detail-stat-value soriku-agent-detail-stat-ok'>{positivePct}%</div>
                <div className='soriku-agent-detail-stat-label'>positive feedback</div>
            </div>}
        </div>;
    }
}
