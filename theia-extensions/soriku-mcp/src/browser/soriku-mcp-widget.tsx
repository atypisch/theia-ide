/********************************************************************************
 * Soriku IDE — MCP servers widget
 *
 * Manage the external MCP servers Soriku connects to AS A CLIENT. Their tools
 * become available to workers/agents/models (namespaced mcp__<server>__<tool>).
 *
 * SPDX-License-Identifier: MIT
 ********************************************************************************/

import * as React from '@theia/core/shared/react';
import { inject, injectable, postConstruct } from '@theia/core/shared/inversify';
import { ReactWidget } from '@theia/core/lib/browser/widgets/react-widget';
import { MessageService } from '@theia/core/lib/common';
import { EngineClient } from 'soriku-engine-client-ext/lib/common/engine-client';
import { McpServer } from 'soriku-engine-client-ext/lib/common/engine-types';
import { Btn, PageHeader } from 'soriku-theme-ext/lib/browser/ui';
import {
    ServerDraft, Transport, emptyDraft, validateDraft, draftToServer, healthLabel, isHealthy,
} from '../common/mcp-servers';

interface McpState {
    status: 'loading' | 'error' | 'ready';
    servers: McpServer[];
    health: Record<string, string>;
    error?: string;
}

type ToolsState = { status: 'loading' } | { status: 'ready'; tools: string[] } | { status: 'error' };

@injectable()
export class SorikuMcpWidget extends ReactWidget {

    static readonly ID = 'soriku-mcp';
    static readonly LABEL = 'Soriku MCP Servers';

    @inject(EngineClient)
    protected readonly engineClient: EngineClient;

    @inject(MessageService)
    protected readonly messages: MessageService;

    protected state: McpState = { status: 'loading', servers: [], health: {} };
    protected draft: ServerDraft = emptyDraft();
    protected busy = false;
    protected addFormOpen = false;
    /**
     * Per-server real tool list, fetched lazily via the same testMcpServer() call used for
     * drafts — listMcpServers() itself carries no tool data for already-configured servers,
     * so this is the only real source rather than fabricating a count.
     */
    protected tools: Record<string, ToolsState> = {};
    protected readonly nameInputRef = React.createRef<HTMLInputElement>();

    @postConstruct()
    protected init(): void {
        this.id = SorikuMcpWidget.ID;
        this.title.label = SorikuMcpWidget.LABEL;
        this.title.caption = SorikuMcpWidget.LABEL;
        this.title.iconClass = 'codicon codicon-plug';
        this.title.closable = true;
        this.node.tabIndex = 0;
        this.addClass('soriku-mcp-widget');
        this.update();
        this.refresh();
    }

    async refresh(): Promise<void> {
        this.state = { ...this.state, status: 'loading' };
        this.update();
        try {
            const res = await this.engineClient.listMcpServers();
            const servers = Array.isArray(res.servers) ? res.servers : [];
            this.state = { status: 'ready', servers, health: res.health ?? {} };
            this.tools = {};
            servers.forEach(s => this.loadTools(s));
        } catch (e) {
            this.state = { ...this.state, status: 'error', error: (e as Error).message };
        }
        this.update();
    }

    protected async loadTools(server: McpServer): Promise<void> {
        this.tools = { ...this.tools, [server.name]: { status: 'loading' } };
        this.update();
        try {
            const res = await this.engineClient.testMcpServer(server);
            this.tools = { ...this.tools, [server.name]: res.ok ? { status: 'ready', tools: res.tools } : { status: 'error' } };
        } catch {
            this.tools = { ...this.tools, [server.name]: { status: 'error' } };
        }
        this.update();
    }

    protected setDraft(patch: Partial<ServerDraft>): void {
        this.draft = { ...this.draft, ...patch };
        this.update();
    }

    protected async save(servers: McpServer[], successMsg: string): Promise<void> {
        this.busy = true;
        this.update();
        try {
            const res = await this.engineClient.putMcpServers(servers);
            this.state = { ...this.state, servers, health: res.health ?? {} };
            this.messages.info(successMsg);
        } catch (e) {
            this.messages.error(`Could not save MCP servers: ${(e as Error).message}`);
        } finally {
            this.busy = false;
            this.update();
        }
    }

    protected async add(): Promise<void> {
        if (this.busy) {
            return;
        }
        const names = this.state.servers.map(s => s.name);
        const validation = validateDraft(this.draft, names);
        if (!validation.ok) {
            this.messages.warn(validation.error ?? 'Invalid server.');
            return;
        }
        const server = draftToServer(this.draft);
        await this.save([...this.state.servers, server], `Added "${server.name}".`);
        this.draft = emptyDraft();
        this.addFormOpen = false;
        this.loadTools(server);
        this.update();
    }

    protected async remove(name: string): Promise<void> {
        if (this.busy) {
            return;
        }
        await this.save(this.state.servers.filter(s => s.name !== name), `Removed "${name}".`);
    }

    protected async test(): Promise<void> {
        if (this.busy) {
            return;
        }
        const validation = validateDraft(this.draft, []);
        if (!validation.ok) {
            this.messages.warn(validation.error ?? 'Invalid server.');
            return;
        }
        this.busy = true;
        this.update();
        try {
            const res = await this.engineClient.testMcpServer(draftToServer(this.draft));
            if (res.ok) {
                this.messages.info(`Connected — ${res.tools.length} tool(s): ${res.tools.join(', ') || '(none)'}`);
            } else {
                this.messages.error(`Connection failed: ${res.error ?? 'unknown error'}`);
            }
        } catch (e) {
            this.messages.error(`Test failed: ${(e as Error).message}`);
        } finally {
            this.busy = false;
            this.update();
        }
    }

    protected focusAddForm = (): void => {
        this.addFormOpen = true;
        this.update();
        window.setTimeout(() => {
            this.nameInputRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
            this.nameInputRef.current?.focus();
        }, 0);
    };

    protected render(): React.ReactNode {
        return <div className='sk-page soriku-mcp'>
            <PageHeader
                eyebrow='Model Context Protocol'
                heading='Tool'
                emphasis='servers'
                subhead='External servers whose tools flow to agents and workers. Connect once, every agent can call them.'
                actions={<>
                    <Btn variant='primary' onClick={this.focusAddForm}>Add server</Btn>
                    <Btn variant='secondary' onClick={() => this.refresh()}>
                        <span className='codicon codicon-refresh' />
                    </Btn>
                </>}
            />
            <div className='sk-page-body sk-page-body-narrow soriku-mcp-body'>
                <div className='soriku-mcp-note'>
                    Their tools become available to your workers, agents and models (namespaced{' '}
                    <code>mcp__server__tool</code>), and require confirmation by default.
                </div>
                {this.addFormOpen && this.renderAddForm()}
                {this.renderBody()}
            </div>
        </div>;
    }

    protected renderAddForm(): React.ReactNode {
        const d = this.draft;
        return <div className='soriku-mcp-add'>
            <div className='soriku-mcp-add-row'>
                <input
                    ref={this.nameInputRef}
                    className='theia-input'
                    type='text'
                    placeholder='name (e.g. github)'
                    value={d.name}
                    onChange={e => this.setDraft({ name: e.target.value })}
                />
                <select
                    className='theia-select'
                    value={d.transport}
                    onChange={e => this.setDraft({ transport: e.target.value as Transport })}
                >
                    <option value='stdio'>stdio</option>
                    <option value='sse'>sse</option>
                </select>
            </div>
            {d.transport === 'stdio'
                ? <div className='soriku-mcp-add-row'>
                    <input
                        className='theia-input'
                        type='text'
                        placeholder='command (e.g. npx)'
                        value={d.command}
                        onChange={e => this.setDraft({ command: e.target.value })}
                    />
                    <input
                        className='theia-input'
                        type='text'
                        placeholder='args (e.g. -y @scope/server)'
                        value={d.args}
                        onChange={e => this.setDraft({ args: e.target.value })}
                    />
                </div>
                : <div className='soriku-mcp-add-row'>
                    <input
                        className='theia-input soriku-mcp-url'
                        type='text'
                        placeholder='https://host/sse'
                        value={d.url}
                        onChange={e => this.setDraft({ url: e.target.value })}
                    />
                </div>}
            <div className='soriku-mcp-add-row soriku-mcp-add-actions'>
                <label className='soriku-mcp-confirm'>
                    <input
                        type='checkbox'
                        checked={d.requiresConfirmation}
                        onChange={e => this.setDraft({ requiresConfirmation: e.target.checked })}
                    /> require confirmation
                </label>
                <span className='soriku-mcp-spacer' />
                <Btn variant='secondary' disabled={this.busy} onClick={() => { this.addFormOpen = false; this.update(); }}>Cancel</Btn>
                <Btn variant='secondary' disabled={this.busy} onClick={() => this.test()}>Test</Btn>
                <Btn disabled={this.busy} onClick={() => this.add()}>Add</Btn>
            </div>
        </div>;
    }

    protected renderBody(): React.ReactNode {
        const { status, servers, health, error } = this.state;
        if (status === 'loading' && servers.length === 0) {
            return <div className='soriku-mcp-message'>Loading MCP servers…</div>;
        }
        if (status === 'error') {
            return <div className='soriku-mcp-message soriku-mcp-error'>
                <div>Could not load MCP servers.</div>
                <div className='soriku-mcp-error-detail'>{error}</div>
                <Btn variant='secondary' onClick={() => this.refresh()}>Retry</Btn>
            </div>;
        }
        if (servers.length === 0) {
            return <div className='soriku-mcp-message'>No MCP servers configured. Add one above.</div>;
        }
        return <div className='soriku-mcp-list'>
            {servers.map(s => this.renderServer(s, health))}
        </div>;
    }

    protected renderServer(s: McpServer, health: Record<string, string>): React.ReactNode {
        const target = s.transport === 'sse' ? (s.url ?? '') : `${s.command ?? ''} ${(s.args ?? []).join(' ')}`.trim();
        const tools = this.tools[s.name];
        return <div key={s.name} className='soriku-mcp-card'>
            <div className='soriku-mcp-card-row'>
                <div className='soriku-mcp-card-icon'>
                    <span className='codicon codicon-plug' />
                </div>
                <div className='soriku-mcp-card-body'>
                    <div className='soriku-mcp-card-head'>
                        <span className='soriku-mcp-card-name'>{s.name}</span>
                        <span className={`soriku-mcp-health ${isHealthy(health, s.name) ? 'ok' : 'bad'}`}>
                            {healthLabel(health, s.name)}
                        </span>
                    </div>
                    <div className='soriku-mcp-card-target'>{s.transport ?? 'stdio'} · {target}</div>
                </div>
                {tools?.status === 'ready' && <div className='soriku-mcp-tool-stat'>
                    <div className='soriku-mcp-tool-stat-value'>{tools.tools.length}</div>
                    <div className='soriku-mcp-tool-stat-label'>tools</div>
                </div>}
                <Btn
                    variant='secondary'
                    disabled={this.busy}
                    onClick={() => this.remove(s.name)}
                >Remove</Btn>
            </div>
            {tools?.status === 'ready' && tools.tools.length > 0 && <div className='soriku-mcp-tool-chips'>
                {tools.tools.map(t => <span key={t} className='soriku-mcp-tool-chip'>{t}</span>)}
            </div>}
        </div>;
    }
}
