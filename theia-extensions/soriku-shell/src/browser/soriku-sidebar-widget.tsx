/********************************************************************************
 * Soriku IDE — unified sidebar: workspace switcher, WORKSPACE nav list and
 * account/settings footer, 1:1 from the mockup's left sidebar.
 *
 * Explorer/Search/Source Control reveal the real Theia widgets already
 * docked in the left area (their tree/diff/etc. implementations are reused
 * as-is — only the icon-rail "activity bar" they used to be selected from is
 * replaced by this nav). Agents/Models/Capability Map/MCP/Routing/
 * Conversations reveal their existing soriku-* widgets wherever those are
 * currently docked (right or main) — Fase 4 moves the remaining right-docked
 * ones to full-page main-area views; this nav's wiring does not need to
 * change when that happens; it just calls each panel's own open command.
 *
 * SPDX-License-Identifier: MIT
 ********************************************************************************/

import { inject, injectable, postConstruct } from '@theia/core/shared/inversify';
import * as React from '@theia/core/shared/react';
import { ReactWidget } from '@theia/core/lib/browser/widgets/react-widget';
import { ApplicationShell } from '@theia/core/lib/browser/shell/application-shell';
import { CommandService } from '@theia/core/lib/common/command';
import { WorkspaceService } from '@theia/workspace/lib/browser/workspace-service';
import { FILE_NAVIGATOR_ID } from '@theia/navigator/lib/browser/navigator-widget';
import { SorikuMark } from 'soriku-theme-ext/lib/browser/ui';

interface NavItem {
    id: string;
    label: string;
    icon: string;
    /** Widget id to try `shell.activateWidget()` on first (radio-style reveal, no reopen). */
    widgetId?: string;
    /** Command to open/reveal the widget when it isn't already in the shell. */
    openCommand: string;
}

const NAV_ITEMS: NavItem[] = [
    { id: 'explorer', label: 'Explorer', icon: 'codicon-files', widgetId: FILE_NAVIGATOR_ID, openCommand: 'fileNavigator:toggle' },
    { id: 'search', label: 'Find in Files', icon: 'codicon-search', openCommand: 'search-in-workspace.toggle' },
    { id: 'scm', label: 'Source Control', icon: 'codicon-source-control', openCommand: 'scmView:toggle' },
    { id: 'agents', label: 'Agents', icon: 'codicon-organization', openCommand: 'soriku.agents.toggle' },
    { id: 'models', label: 'Models', icon: 'codicon-layers', openCommand: 'soriku.models.open' },
    { id: 'capmap', label: 'Capability Map', icon: 'codicon-graph', openCommand: 'soriku.capabilityMap.open' },
    { id: 'mcp', label: 'MCP Servers', icon: 'codicon-plug', openCommand: 'soriku.mcp.open' },
    { id: 'routing', label: 'Routing', icon: 'codicon-git-merge', openCommand: 'soriku.routing.overrides.open' },
    { id: 'conversations', label: 'Conversations', icon: 'codicon-comment-discussion', openCommand: 'soriku.conversations.open' },
];

@injectable()
export class SorikuSidebarWidget extends ReactWidget {

    static readonly ID = 'soriku-sidebar';

    @inject(ApplicationShell)
    protected readonly shell: ApplicationShell;

    @inject(CommandService)
    protected readonly commands: CommandService;

    @inject(WorkspaceService)
    protected readonly workspaceService: WorkspaceService;

    protected activeNav = 'explorer';

    @postConstruct()
    protected init(): void {
        this.id = SorikuSidebarWidget.ID;
        this.addClass('soriku-sidebar');
        this.update();
        this.toDispose.push(this.workspaceService.onWorkspaceChanged(() => this.update()));
    }

    protected async selectNav(item: NavItem): Promise<void> {
        this.activeNav = item.id;
        this.update();
        const activated = item.widgetId && await this.shell.activateWidget(item.widgetId);
        if (!activated) {
            await this.commands.executeCommand(item.openCommand);
        }
    }

    protected openSettings = (): void => {
        this.commands.executeCommand('soriku.settings.open');
    };

    protected get workspaceName(): string {
        const ws = this.workspaceService.workspace;
        return ws ? ws.resource.path.base : 'No workspace';
    }

    protected render(): React.ReactNode {
        return (
            <div className="soriku-sidebar-inner">
                <button className="soriku-sidebar-workspace" onClick={() => this.commands.executeCommand('workspace:open')}>
                    <SorikuMark size={22} />
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
                <div className="soriku-sidebar-spacer" />
                <div className="soriku-sidebar-footer">
                    <span className="soriku-sidebar-avatar">You</span>
                    <div className="soriku-sidebar-footer-text">
                        <div className="soriku-sidebar-footer-name">Account</div>
                        <div className="soriku-sidebar-footer-plan">Local · Free plan</div>
                    </div>
                    <button className="soriku-sidebar-settings-btn" title="Settings" onClick={this.openSettings}>
                        <span className="codicon codicon-settings-gear" />
                    </button>
                </div>
            </div>
        );
    }
}
