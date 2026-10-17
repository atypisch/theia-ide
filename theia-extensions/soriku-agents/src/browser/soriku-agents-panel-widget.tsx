/********************************************************************************
 * Soriku IDE — Agents panel (v2 l.1206-1336): who is working on this run, plus the agents' sessions
 *
 * SPDX-License-Identifier: MIT
 ********************************************************************************/

import * as React from '@theia/core/shared/react';
import { ReactWidget } from '@theia/core/lib/browser/widgets/react-widget';
import { CommandService } from '@theia/core/lib/common';
import { inject, injectable, postConstruct } from '@theia/core/shared/inversify';
import { EngineClient } from 'soriku-engine-client-ext/lib/common/engine-client';
import { ConversationSummary } from 'soriku-engine-client-ext/lib/common/engine-types';
import { conversationTitle } from 'soriku-engine-client-ext/lib/common/conversation-title';
import { RunAgentView } from 'soriku-engine-client-ext/lib/common/run-state';
import { SorikuRunStateService } from 'soriku-engine-client-ext/lib/browser/soriku-run-state-service';
import { SorikuConversationLink } from 'soriku-engine-client-ext/lib/browser/soriku-conversation-link';
import { AgentAvatar, toKnownCategory } from 'soriku-theme-ext/lib/browser/ui';
import { SorikuAgentCatalog } from './soriku-agent-catalog';
import { SorikuAgentSelectionService } from './soriku-agent-selection';
import { AgentItem, initials, toAgentItems } from '../common/agent-view';
import { agentRowStatus, relativeWhen } from '../common/agents-panel';

type PanelTab = 'sessions' | 'performance';

/** Chat commands the panel triggers (registered by soriku-chat) — kept as ids so the two extensions stay decoupled. */
const CHAT_SUBAGENT_INSIGHT = 'soriku.chat.subagent.insight';
const CHAT_SUBAGENT_SPAWN = 'soriku.chat.subagent.spawn';

@injectable()
export class SorikuAgentsPanelWidget extends ReactWidget {

    static readonly ID = 'soriku-agents-panel';
    static readonly LABEL = 'Agents';

    @inject(SorikuRunStateService)
    protected readonly runState: SorikuRunStateService;

    @inject(SorikuAgentCatalog)
    protected readonly catalog: SorikuAgentCatalog;

    @inject(SorikuAgentSelectionService)
    protected readonly selection: SorikuAgentSelectionService;

    @inject(EngineClient)
    protected readonly engine: EngineClient;

    @inject(SorikuConversationLink)
    protected readonly conversationLink: SorikuConversationLink;

    @inject(CommandService)
    protected readonly commands: CommandService;

    protected agents: AgentItem[] = [];
    protected selectedId: string | undefined;
    protected tab: PanelTab = 'sessions';
    protected sessions: ConversationSummary[] | undefined;
    protected sessionsFor: string | undefined;

    @postConstruct()
    protected init(): void {
        this.id = SorikuAgentsPanelWidget.ID;
        this.title.label = SorikuAgentsPanelWidget.LABEL;
        this.title.caption = 'Agents in this run';
        this.title.iconClass = 'codicon codicon-organization';
        this.title.closable = true;
        this.addClass('soriku-agents-panel-widget');
        this.toDispose.push(this.runState.onDidChange(() => this.update()));
        this.toDispose.push(this.selection.onDidChangeActive(() => { this.selectedId = undefined; this.update(); }));
        this.toDispose.push(this.conversationLink.onDidChange(() => { this.sessionsFor = undefined; this.update(); }));
        this.catalog.getAgents().then(list => { this.agents = toAgentItems(list); this.update(); }).catch(() => undefined);
        this.update();
    }

    protected selected(): AgentItem | undefined {
        const id = this.selectedId ?? this.selection.getActiveId();
        return this.agents.find(a => a.id === id) ?? this.agents[0];
    }

    protected loadSessions(agent: AgentItem | undefined): void {
        if (!agent || this.sessionsFor === agent.id) { return; }
        this.sessionsFor = agent.id;
        this.sessions = undefined;
        this.engine.listConversations()
            .then(all => {
                if (this.sessionsFor !== agent.id) { return; }
                this.sessions = all.filter(c => c.persona_id === agent.id).sort((a, b) => b.created_at.localeCompare(a.created_at));
                this.update();
            })
            .catch(() => { this.sessions = []; this.update(); });
    }

    protected render(): React.ReactNode {
        const run = this.runState.get();
        const selected = this.selected();
        this.loadSessions(selected);
        const inRunPersonas = new Set(run.agents.map(a => a.personaId).filter((x): x is string => !!x));
        const others = this.agents.filter(a => !inRunPersonas.has(a.id));
        return <div className="sk-agp">
            <div className="sk-agp-head">
                <span className="sk-agp-title">Agents</span>
                <span className="sk-eyebrow" style={{ textTransform: 'none', letterSpacing: 0 }}>
                    {run.agents.length > 0 ? `${run.agents.length} in this run` : 'no run yet'}
                </span>
                <div style={{ flex: 1 }} />
                <button className="sk-icon-btn" title="Close" onClick={() => this.close()}>×</button>
            </div>
            <div className="sk-agp-top sk-scroll">{selected ? this.renderSelected(selected, run.agents) : <div className="sk-agp-empty">No agents loaded.</div>}</div>
            <div className="sk-agp-bottom sk-scroll">
                <div className="sk-eyebrow sk-agp-label">This run</div>
                {run.agents.length === 0 && <div className="sk-agp-empty">Agents appear here while a plan runs.</div>}
                {run.agents.map(a => this.renderRunRow(a, run.planId))}
                {others.length > 0 && <>
                    <div className="sk-eyebrow sk-agp-label" style={{ marginTop: 14 }}>Other agents · {others.length}</div>
                    {others.map(a => (
                        <div key={a.id} className={`sk-agp-row small${selected?.id === a.id ? ' on' : ''}`} onClick={() => { this.selectedId = a.id; this.update(); }}>
                            <AgentAvatar initials={initials(a.name)} category={toKnownCategory(a.category)} size="sm" />
                            <span className="sk-agp-name">{a.name}</span>
                            <span className="sk-agp-idle">idle</span>
                        </div>
                    ))}
                </>}
            </div>
        </div>;
    }

    protected renderSelected(agent: AgentItem, runAgents: RunAgentView[]): React.ReactNode {
        const inRun = runAgents.find(a => a.personaId === agent.id);
        return <>
            <div className="sk-agp-sel">
                <AgentAvatar initials={initials(agent.name)} category={toKnownCategory(agent.category)} size="md" />
                <div className="sk-flex">
                    <div className="sk-agp-name">{agent.name}</div>
                    <div className="sk-agp-model">{agent.preferredModel ?? agent.role}</div>
                </div>
                <button className="sk-icon-btn" title="Open agent" onClick={() => this.fire(this.commands.executeCommand('soriku.agents.toggle'))}>↗</button>
            </div>
            <div className="sk-agp-tabs">
                {(['sessions', 'performance'] as PanelTab[]).map(t => (
                    <button key={t} className={`sk-agp-tab${this.tab === t ? ' on' : ''}`} onClick={() => { this.tab = t; this.update(); }}>
                        {t === 'sessions' ? `Sessions${this.sessions ? ` · ${this.sessions.length}` : ''}` : 'Performance'}
                    </button>
                ))}
            </div>
            {this.tab === 'sessions' ? this.renderSessions() : this.renderPerformance(agent, inRun, runAgents)}
            <div className="sk-agp-msg">
                <input disabled placeholder={`Message ${agent.name}…`} title="Sending a note to a running agent needs engine support (planned)" />
            </div>
        </>;
    }

    protected renderSessions(): React.ReactNode {
        if (this.sessions === undefined) { return <div className="sk-agp-empty">Loading…</div>; }
        if (this.sessions.length === 0) { return <div className="sk-agp-empty">No sessions with this agent yet.</div>; }
        return this.sessions.slice(0, 20).map(c => (
            <div key={c.id} className="sk-agp-session" onClick={() => this.conversationLink.requestOpen(c.id)}>
                <div className="sk-agp-session-title">{conversationTitle(c.title)}</div>
                <div className="sk-agp-session-sub">{relativeWhen(c.created_at)} · {c.message_count} {c.message_count === 1 ? 'message' : 'messages'}</div>
            </div>
        ));
    }

    protected renderPerformance(agent: AgentItem, inRun: RunAgentView | undefined, runAgents: RunAgentView[]): React.ReactNode {
        const tile = (value: string, label: string): React.ReactElement => (
            <div className="sk-agp-tile"><div className="sk-agp-tile-v">{value}</div><div className="sk-agp-tile-l">{label}</div></div>
        );
        return <>
            <div className="sk-eyebrow sk-agp-label">This run</div>
            <div className="sk-agp-tiles">
                {tile(inRun ? String(inRun.files) : '—', 'files written')}
                {tile(String(runAgents.length), 'agents in run')}
                {tile(inRun ? (inRun.status === 'running' ? 'live' : inRun.status) : '—', 'status')}
            </div>
            <div className="sk-eyebrow sk-agp-label" style={{ marginTop: 14 }}>All time</div>
            <div className="sk-agp-empty">Success and correction rates need per-run results from the engine; they are not shown until the engine reports them.
                {this.sessions ? ` ${agent.name} has ${this.sessions.length} stored ${this.sessions.length === 1 ? 'session' : 'sessions'}.` : ''}</div>
        </>;
    }

    protected renderRunRow(a: RunAgentView, planId: string | undefined): React.ReactNode {
        const st = agentRowStatus(a);
        const category = toKnownCategory(a.role?.includes('review') ? 'reasoning' : 'coding');
        const canOpenInsight = a.minion && !!planId && !!a.personaId;
        return <div key={a.workerId} className={`sk-agp-row${a.minion ? ' minion' : ''}${canOpenInsight ? ' clickable' : ''}`}
            onClick={canOpenInsight ? () => this.fire(this.commands.executeCommand(CHAT_SUBAGENT_INSIGHT, { planId, workerId: a.workerId })) : undefined}>
            <AgentAvatar initials={initials(a.name)} category={category} size="md" />
            <div className="sk-flex">
                <div className="sk-agp-name">{a.name}{a.minion && <span className="sk-agp-sub">SUB</span>}</div>
                <div className={`sk-agp-status ${st.tone}`}>{st.text}</div>
            </div>
            {!a.minion && !!planId && !!a.personaId && <button className="sk-icon-btn" title="Spawn a sub-agent under this agent"
                onClick={e => { e.stopPropagation(); this.spawnFor(planId, a.personaId!); }}>+</button>}
            <span className={`sk-agp-dot ${st.tone}${st.pulse ? ' pulse' : ''}`} />
        </div>;
    }

    protected fire(p: PromiseLike<unknown>): void {
        Promise.resolve(p).catch(() => undefined);
    }

    /** Spawn a sub-agent under a head agent of the current run (opens the chat's Spawn dialog). */
    spawnFor(planId: string, parentAgentId: string): void {
        this.fire(this.commands.executeCommand(CHAT_SUBAGENT_SPAWN, { planId, parentAgentId }));
    }
}
