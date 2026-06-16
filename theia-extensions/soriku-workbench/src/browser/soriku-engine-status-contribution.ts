/********************************************************************************
 * Soriku IDE — engine connection status bar + management
 *
 * SPDX-License-Identifier: MIT
 ********************************************************************************/

import { inject, injectable } from '@theia/core/shared/inversify';
import { Command, CommandContribution, CommandRegistry, MessageService, PreferenceScope, PreferenceService } from '@theia/core/lib/common';
import { QuickInputService } from '@theia/core/lib/browser';
import { FrontendApplicationContribution } from '@theia/core/lib/browser/frontend-application-contribution';
import { StatusBar, StatusBarAlignment } from '@theia/core/lib/browser/status-bar/status-bar';
import { SORIKU_ENGINE_BASE_URL } from 'soriku-engine-client-ext/lib/browser/soriku-engine-preferences';
import { EngineConnectionState, computeEngineStatusView } from '../common/engine-status';
import { SorikuEngineStatusService } from './soriku-engine-status-service';
import { SORIKU_ENGINE_AUTOCONNECT } from './soriku-workbench-preferences';

export const SORIKU_ENGINE_STATUS_ID = 'soriku-engine-status';

export namespace SorikuEngineCommands {
    const CATEGORY = 'Soriku';
    export const MANAGE: Command = { id: 'soriku.engine.manage', category: CATEGORY, label: 'Manage Engine Connection' };
    export const RECONNECT: Command = { id: 'soriku.engine.reconnect', category: CATEGORY, label: 'Reconnect to Engine' };
    export const SWITCH_URL: Command = { id: 'soriku.engine.switchUrl', category: CATEGORY, label: 'Switch Engine URL' };
}

@injectable()
export class SorikuEngineStatusContribution implements FrontendApplicationContribution, CommandContribution {

    @inject(SorikuEngineStatusService)
    protected readonly status: SorikuEngineStatusService;

    @inject(StatusBar)
    protected readonly statusBar: StatusBar;

    @inject(QuickInputService)
    protected readonly quickInput: QuickInputService;

    @inject(PreferenceService)
    protected readonly preferences: PreferenceService;

    @inject(MessageService)
    protected readonly messages: MessageService;

    async onStart(): Promise<void> {
        this.status.onDidChangeState(state => this.updateStatusBar(state));
        this.updateStatusBar(this.status.getState());
        const autoConnect = this.preferences.get<boolean>(SORIKU_ENGINE_AUTOCONNECT, true);
        if (autoConnect) {
            await this.status.connect();
        }
    }

    registerCommands(commands: CommandRegistry): void {
        commands.registerCommand(SorikuEngineCommands.MANAGE, { execute: () => this.manage() });
        commands.registerCommand(SorikuEngineCommands.RECONNECT, { execute: () => this.status.connect() });
        commands.registerCommand(SorikuEngineCommands.SWITCH_URL, { execute: () => this.switchUrl() });
    }

    protected async manage(): Promise<void> {
        const pick = await this.quickInput.showQuickPick(
            [
                { label: 'Reconnect', id: 'reconnect' },
                { label: 'Switch Engine URL…', id: 'switch' },
                { label: 'Open Engine Settings', id: 'settings' },
            ],
            { title: 'Soriku engine connection' },
        );
        if (pick?.id === 'reconnect') {
            await this.status.connect();
        } else if (pick?.id === 'switch') {
            await this.switchUrl();
        } else if (pick?.id === 'settings') {
            // Open the Settings UI focused on the soriku.engine.* group.
            this.preferences.set(SORIKU_ENGINE_BASE_URL, this.status.getState().baseUrl, PreferenceScope.User).catch(() => { /* no-op */ });
            this.messages.info('Edit soriku.engine.baseUrl in Settings to change the engine URL.');
        }
    }

    protected async switchUrl(): Promise<void> {
        const current = this.status.getState().baseUrl;
        const url = await this.quickInput.input({
            title: 'Switch Soriku engine URL',
            prompt: 'Engine base URL',
            value: current,
            placeHolder: 'http://127.0.0.1:8765',
        });
        if (!url || !url.trim()) {
            return;
        }
        await this.preferences.set(SORIKU_ENGINE_BASE_URL, url.trim(), PreferenceScope.User);
        await this.status.connect();
    }

    protected updateStatusBar(state: EngineConnectionState): void {
        const view = computeEngineStatusView(state);
        this.statusBar.setElement(SORIKU_ENGINE_STATUS_ID, {
            text: `${this.iconFor(state)} ${view.text}`,
            tooltip: view.tooltip,
            alignment: StatusBarAlignment.RIGHT,
            command: SorikuEngineCommands.MANAGE.id,
            priority: 200,
        });
    }

    protected iconFor(state: EngineConnectionState): string {
        if (state.status === 'connecting') {
            return '$(sync~spin)';
        }
        if (state.status === 'connected') {
            return '$(plug)';
        }
        return '$(debug-disconnect)';
    }
}
