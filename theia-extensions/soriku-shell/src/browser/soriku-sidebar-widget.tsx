/********************************************************************************
 * Soriku IDE — unified sidebar: workspace switcher, WORKSPACE nav list and
 * an always-visible context panel underneath (FILES-tree for Explorer, a
 * live search box for Find in Files, commit UI for Source Control, and a
 * real-stats side-info card for Agents/Models/Capability Map/MCP/Routing/
 * Settings), plus an account/settings footer — 1:1 from the mockup's left
 * sidebar.
 *
 * Explorer/Find/SCM render straight from the real, root-bound
 * FileNavigatorModel/SearchInWorkspaceService/ScmService rather than
 * reparenting their own Lumino widgets (ruled out as too fragile — see
 * Fase R6 in the remediation plan). Agents/Models/Capability Map/MCP/
 * Routing still open their existing full-page main-area view on select;
 * Conversations has no context panel (mockup shows the context area empty
 * there).
 *
 * SPDX-License-Identifier: MIT
 ********************************************************************************/

import { inject, injectable, postConstruct } from '@theia/core/shared/inversify';
import * as React from '@theia/core/shared/react';
import { ReactWidget } from '@theia/core/lib/browser/widgets/react-widget';
import { ApplicationShell } from '@theia/core/lib/browser/shell/application-shell';
import { WidgetManager } from '@theia/core/lib/browser/widget-manager';
import { OpenerService } from '@theia/core/lib/browser/opener-service';
import { DecorationsService } from '@theia/core/lib/browser/decorations-service';
import { CommandService } from '@theia/core/lib/common/command';
import { WorkspaceService } from '@theia/workspace/lib/browser/workspace-service';
import { Endpoint } from '@theia/core/lib/browser/endpoint';
import { FileService } from '@theia/filesystem/lib/browser/file-service';
import { FileNavigatorWidget } from '@theia/navigator/lib/browser/navigator-widget';
import { FileNavigatorModel } from '@theia/navigator/lib/browser/navigator-model';
import { FILE_NAVIGATOR_ID } from '@theia/navigator/lib/browser/navigator-widget';
import { ScmService } from '@theia/scm/lib/browser/scm-service';
import { SearchInWorkspaceService } from '@theia/search-in-workspace/lib/browser/search-in-workspace-service';
import { EngineClient } from 'soriku-engine-client-ext/lib/common/engine-client';
import { SorikuEngineStatusService } from 'soriku-workbench-ext/lib/browser/soriku-engine-status-service';
import { shortHost } from 'soriku-workbench-ext/lib/common/engine-status';
import { SorikuAuthService } from 'soriku-auth-ext/lib/browser/soriku-auth-service';
import { sidebarAccountView } from '../common/sidebar-account-view';
import { SorikuSidebarFilesPanel } from './panels/soriku-sidebar-files-panel';
import { SorikuSidebarSearchPanel } from './panels/soriku-sidebar-search-panel';
import { SorikuSidebarScmPanel } from './panels/soriku-sidebar-scm-panel';
import { SorikuSidebarInfoPanel, InfoPanelStat } from './panels/soriku-sidebar-info-panel';

interface NavItem {
    id: string;
    label: string;
    icon: string;
    /** Command to open/reveal the widget's full-page main-area view. Omitted for nav items whose panel is fully embedded (Explorer/Find/SCM). */
    openCommand?: string;
}

const NAV_ITEMS: NavItem[] = [
    { id: 'explorer', label: 'Explorer', icon: 'codicon-files' },
    { id: 'search', label: 'Find in Files', icon: 'codicon-search' },
    { id: 'scm', label: 'Source Control', icon: 'codicon-source-control' },
    { id: 'agents', label: 'Agents', icon: 'codicon-organization', openCommand: 'soriku.agents.toggle' },
    { id: 'models', label: 'Models', icon: 'codicon-layers', openCommand: 'soriku.models.open' },
    { id: 'capmap', label: 'Capability Map', icon: 'codicon-graph', openCommand: 'soriku.capabilityMap.open' },
    { id: 'mcp', label: 'MCP Servers', icon: 'codicon-plug', openCommand: 'soriku.mcp.open' },
    { id: 'routing', label: 'Routing', icon: 'codicon-git-merge', openCommand: 'soriku.routing.overrides.open' },
    { id: 'conversations', label: 'Conversations', icon: 'codicon-comment-discussion', openCommand: 'soriku.conversations.open' },
];

interface InfoState {
    status: 'loading' | 'error' | 'ready';
    error?: string;
    stats: InfoPanelStat[];
}

@injectable()
export class SorikuSidebarWidget extends ReactWidget {

    static readonly ID = 'soriku-sidebar';

    @inject(ApplicationShell)
    protected readonly shell: ApplicationShell;

    @inject(CommandService)
    protected readonly commands: CommandService;

    @inject(WorkspaceService)
    protected readonly workspaceService: WorkspaceService;

    @inject(FileService)
    protected readonly fileService: FileService;

    @inject(SorikuAuthService)
    protected readonly authService: SorikuAuthService;

    @inject(WidgetManager)
    protected readonly widgetManager: WidgetManager;

    @inject(OpenerService)
    protected readonly openerService: OpenerService;

    @inject(DecorationsService)
    protected readonly decorationsService: DecorationsService;

    @inject(ScmService)
    protected readonly scmService: ScmService;

    @inject(SearchInWorkspaceService)
    protected readonly searchService: SearchInWorkspaceService;

    @inject(EngineClient)
    protected readonly engineClient: EngineClient;

    @inject(SorikuEngineStatusService)
    protected readonly engineStatus: SorikuEngineStatusService;

    protected activeNav = 'explorer';
    protected filesModel: FileNavigatorModel | undefined;
    protected infoState: Partial<Record<string, InfoState>> = {};
    protected workspaceIconUrl: string | undefined;

    @postConstruct()
    protected init(): void {
        this.id = SorikuSidebarWidget.ID;
        this.addClass('soriku-sidebar');
        this.update();
        this.toDispose.push(this.workspaceService.onWorkspaceChanged(() => {
            this.refreshWorkspaceIcon().catch(() => { /* ignore */ });
            this.update();
        }));
        this.toDispose.push(this.authService.onDidChangeState(() => this.update()));
        this.toDispose.push(this.scmService.onDidChangeSelectedRepository(() => this.update()));
        this.toDispose.push(this.engineStatus.onDidChangeState(() => { if (this.activeNav === 'settings') { this.update(); } }));
        this.loadFilesModel();
        this.loadInfo(this.activeNav);
        this.refreshWorkspaceIcon().catch(() => { /* ignore */ });
    }

    protected async refreshWorkspaceIcon(): Promise<void> {
        const root = this.workspaceService.tryGetRoots()[0]?.resource;
        if (!root) {
            this.workspaceIconUrl = undefined;
            this.update();
            return;
        }
        const candidates = ['favicon.ico', 'favicon.png', 'favicon.svg', 'public/favicon.ico', 'public/favicon.png', 'assets/favicon.ico'];
        for (const rel of candidates) {
            const uri = root.resolve(rel);
            if (await this.fileService.exists(uri)) {
                const endpoint = new Endpoint({ path: `files${uri.path.toString()}` });
                this.workspaceIconUrl = endpoint.getRestUrl().toString();
                this.update();
                return;
            }
        }
        this.workspaceIconUrl = undefined;
        this.update();
    }

    protected async loadFilesModel(): Promise<void> {
        const widget = await this.widgetManager.getOrCreateWidget<FileNavigatorWidget>(FILE_NAVIGATOR_ID);
        this.filesModel = widget.model;
        this.update();
    }

    protected async selectNav(item: NavItem): Promise<void> {
        this.activeNav = item.id;
        this.update();
        if (item.openCommand) {
            await this.commands.executeCommand(item.openCommand);
        }
        this.loadInfo(item.id);
    }

    protected async loadInfo(navId: string): Promise<void> {
        const loader = INFO_LOADERS[navId];
        if (!loader || this.infoState[navId]) {
            return;
        }
        this.infoState[navId] = { status: 'loading', stats: [] };
        this.update();
        try {
            const stats = await loader(this.engineClient, this.engineStatus);
            this.infoState[navId] = { status: 'ready', stats };
        } catch (e) {
            this.infoState[navId] = { status: 'error', error: (e as Error).message, stats: [] };
        }
        this.update();
    }

    protected retryInfo(navId: string): void {
        delete this.infoState[navId];
        this.loadInfo(navId);
    }

    protected openSettings = (): void => {
        this.activeNav = 'settings';
        this.update();
        this.commands.executeCommand('soriku.settings.open');
        this.loadInfo('settings');
    };

    protected get workspaceName(): string {
        const ws = this.workspaceService.workspace;
        return ws ? ws.resource.path.base : 'No workspace';
    }

    protected get workspaceInitials(): string {
        const name = this.workspaceName.trim();
        if (!name) {
            return 'PR';
        }
        const parts = name.split(/[\s\-_]+/).filter(Boolean);
        if (parts.length >= 2) {
            return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
        }
        return name.slice(0, 2).toUpperCase();
    }

    protected render(): React.ReactNode {
        return (
            <div className="soriku-sidebar-inner">
                <button className="soriku-sidebar-workspace" onClick={() => this.commands.executeCommand('workspace:open')}>
                    <div className="soriku-sidebar-workspace-icon-slot">
                        {this.workspaceIconUrl && <img
                            className="soriku-sidebar-workspace-icon"
                            src={this.workspaceIconUrl}
                            alt=""
                            onError={() => { this.workspaceIconUrl = undefined; this.update(); }}
                        />}
                    </div>
                    <div className="soriku-sidebar-workspace-text">
                        <div className="soriku-sidebar-workspace-name">{this.workspaceName}</div>
                    </div>
                    <span className="codicon codicon-chevron-down soriku-sidebar-workspace-chevron" />
                </button>
                <div className="soriku-sidebar-section-label">Workspace</div>
                <ul className="soriku-sidebar-nav">
                    {NAV_ITEMS.map(item => (
                        <li
                            key={item.id}
                            className={`soriku-sidebar-nav-item${item.id === this.activeNav ? ' active' : ''}`}
                            onClick={() => this.selectNav(item)}
                        >
                            <span className={`codicon ${item.icon}`} />
                            <span className="soriku-sidebar-nav-label">{item.label}</span>
                        </li>
                    ))}
                </ul>
                <div className="soriku-sidebar-context">{this.renderContext()}</div>
                {this.renderFooter()}
            </div>
        );
    }

    protected renderContext(): React.ReactNode {
        switch (this.activeNav) {
            case 'explorer':
                return this.filesModel
                    ? <SorikuSidebarFilesPanel model={this.filesModel} decorations={this.decorationsService} commands={this.commands} />
                    : <div className="soriku-sidebar-files-empty">Loading…</div>;
            case 'search':
                return <SorikuSidebarSearchPanel searchService={this.searchService} openerService={this.openerService} />;
            case 'scm':
                return <SorikuSidebarScmPanel repository={this.scmService.selectedRepository} commands={this.commands} />;
            case 'conversations':
                return undefined;
            default: {
                const state = this.infoState[this.activeNav];
                if (!state) {
                    return undefined;
                }
                return (
                    <SorikuSidebarInfoPanel
                        eyebrow={(NAV_ITEMS.find(n => n.id === this.activeNav)?.label ?? (this.activeNav === 'settings' ? 'Settings' : '')).toUpperCase()}
                        status={state.status}
                        error={state.error}
                        stats={state.stats}
                        onRetry={() => this.retryInfo(this.activeNav)}
                    />
                );
            }
        }
    }

    /** Local: static "Local · Free plan" (mockup default). Simezu: real, already-loaded auth state. */
    protected renderFooter(): React.ReactNode {
        const view = sidebarAccountView(this.authService.getState());
        return (
            <div className="soriku-sidebar-footer">
                <span className="soriku-sidebar-avatar">{view.avatarText}</span>
                <div className="soriku-sidebar-footer-text">
                    <div className="soriku-sidebar-footer-name">{view.name}</div>
                    <div className="soriku-sidebar-footer-plan">{view.subtitle}</div>
                </div>
                <button className="soriku-sidebar-settings-btn" title="Settings" onClick={this.openSettings}>
                    <span className="codicon codicon-settings-gear" />
                </button>
            </div>
        );
    }
}

type InfoLoader = (engineClient: EngineClient, engineStatus: SorikuEngineStatusService) => Promise<InfoPanelStat[]>;

const INFO_LOADERS: Record<string, InfoLoader> = {
    agents: async engineClient => {
        const res = await engineClient.listAgents();
        return [{ icon: 'codicon-organization', label: 'Active agents', value: String(res.data?.length ?? 0) }];
    },
    models: async engineClient => {
        const res = await engineClient.listInstalledModels();
        const models = res.models ?? [];
        const warm = models.filter(m => m.is_running).length;
        return [
            { icon: 'codicon-layers', label: 'Installed models', value: String(models.length) },
            { icon: 'codicon-flame', label: 'Warm now', value: String(warm) },
        ];
    },
    capmap: async engineClient => {
        const res = await engineClient.getCapabilities();
        const count = Object.keys(res.models ?? {}).length;
        return [{ icon: 'codicon-graph', label: 'Mapped models', value: String(count) }];
    },
    mcp: async engineClient => {
        const res = await engineClient.listMcpServers();
        return [{ icon: 'codicon-plug', label: 'Connections', value: String(res.servers?.length ?? 0) }];
    },
    routing: async engineClient => {
        const [overrides, gaps] = await Promise.all([engineClient.listRoutingOverrides(), engineClient.getRoutingGaps()]);
        return [
            { icon: 'codicon-git-merge', label: 'Overrides', value: String(overrides.overrides?.length ?? 0) },
            { icon: 'codicon-warning', label: 'Gaps', value: String(gaps.gaps?.length ?? 0) },
        ];
    },
    settings: async (_engineClient, engineStatus) => {
        const state = engineStatus.getState();
        return [{ icon: 'codicon-pulse', label: 'Engine', value: `${shortHost(state.baseUrl)} · ${state.status}` }];
    },
};
