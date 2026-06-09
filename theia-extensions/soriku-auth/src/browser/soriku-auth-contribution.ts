/********************************************************************************
 * Soriku IDE — auth status bar + commands
 *
 * SPDX-License-Identifier: MIT
 ********************************************************************************/

import { inject, injectable } from '@theia/core/shared/inversify';
import { Command, CommandContribution, CommandRegistry, MessageService } from '@theia/core/lib/common';
import { QuickInputService } from '@theia/core/lib/browser';
import { FrontendApplicationContribution } from '@theia/core/lib/browser/frontend-application-contribution';
import { StatusBar, StatusBarAlignment } from '@theia/core/lib/browser/status-bar/status-bar';
import { AuthState, computeStatusView } from '../common/auth-status';
import { SorikuAuthService } from './soriku-auth-service';

export const SORIKU_AUTH_STATUS_ID = 'soriku-auth-status';

export namespace SorikuAuthCommands {
    const CATEGORY = 'Soriku';
    export const CONNECT: Command = { id: 'soriku.auth.connect', category: CATEGORY, label: 'Connect to Simezu' };
    export const DISCONNECT: Command = { id: 'soriku.auth.disconnect', category: CATEGORY, label: 'Disconnect from Simezu' };
    export const REFRESH: Command = { id: 'soriku.auth.refresh', category: CATEGORY, label: 'Refresh Connection Status' };
    export const MANAGE: Command = { id: 'soriku.auth.manage', category: CATEGORY, label: 'Manage Connection' };
}

@injectable()
export class SorikuAuthContribution implements FrontendApplicationContribution, CommandContribution {

    @inject(SorikuAuthService)
    protected readonly auth: SorikuAuthService;

    @inject(StatusBar)
    protected readonly statusBar: StatusBar;

    @inject(QuickInputService)
    protected readonly quickInput: QuickInputService;

    @inject(MessageService)
    protected readonly messages: MessageService;

    async onStart(): Promise<void> {
        this.auth.onDidChangeState(state => this.updateStatusBar(state));
        this.updateStatusBar(this.auth.getState());
        // Token load + first engine query; failures degrade gracefully to "engine unknown".
        await this.auth.initialize();
    }

    registerCommands(commands: CommandRegistry): void {
        commands.registerCommand(SorikuAuthCommands.CONNECT, { execute: () => this.auth.connect() });
        commands.registerCommand(SorikuAuthCommands.DISCONNECT, { execute: () => this.auth.disconnect() });
        commands.registerCommand(SorikuAuthCommands.REFRESH, { execute: () => this.auth.refresh() });
        commands.registerCommand(SorikuAuthCommands.MANAGE, { execute: () => this.manage() });
    }

    protected async manage(): Promise<void> {
        const state = this.auth.getState();
        if (state.mode === 'local') {
            this.messages.info('Soriku engine is in local mode — no sign-in required.');
            return;
        }
        if (state.hasToken) {
            const pick = await this.quickInput.showQuickPick(
                [
                    { label: 'Disconnect from Simezu', id: 'disconnect' },
                    { label: 'Refresh status', id: 'refresh' },
                ],
                { title: 'Soriku — Simezu connection' },
            );
            if (pick?.id === 'disconnect') {
                await this.auth.disconnect();
            } else if (pick?.id === 'refresh') {
                await this.auth.refresh();
            }
            return;
        }
        await this.auth.connect();
    }

    protected updateStatusBar(state: AuthState): void {
        const view = computeStatusView(state);
        const icon = this.iconFor(state);
        this.statusBar.setElement(SORIKU_AUTH_STATUS_ID, {
            text: `${icon} ${view.text}`,
            tooltip: view.tooltip,
            alignment: StatusBarAlignment.RIGHT,
            command: SorikuAuthCommands.MANAGE.id,
            priority: 100,
        });
    }

    protected iconFor(state: AuthState): string {
        if (state.error) {
            return '$(warning)';
        }
        if (state.mode === 'local') {
            return '$(home)';
        }
        if (state.mode === 'simezu' && state.hasToken) {
            return '$(account)';
        }
        if (state.mode === 'simezu') {
            return '$(sign-in)';
        }
        return '$(question)';
    }
}
