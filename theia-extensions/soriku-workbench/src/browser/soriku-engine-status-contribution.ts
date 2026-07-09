/********************************************************************************
 * Soriku IDE — engine connection status bar + management
 *
 * SPDX-License-Identifier: MIT
 ********************************************************************************/

import { inject, injectable } from '@theia/core/shared/inversify';
import { Command, CommandContribution, CommandRegistry, CommandService, MessageService, PreferenceScope, PreferenceService } from '@theia/core/lib/common';
import { QuickInputService } from '@theia/core/lib/browser';
import { FrontendApplicationContribution } from '@theia/core/lib/browser/frontend-application-contribution';
import { StatusBar, StatusBarAlignment } from '@theia/core/lib/browser/status-bar/status-bar';
import { DEFAULT_ENGINE_BASE_URL, SORIKU_ENGINE_BASE_URL } from 'soriku-engine-client-ext/lib/browser/soriku-engine-preferences';
import { EngineConnectionState, FirstRunChoice, computeEngineStatusView, engineStatusBarLabel, firstRunAction } from '../common/engine-status';
import { SorikuEngineStatusService } from './soriku-engine-status-service';
import { SORIKU_ENGINE_AUTOCONNECT, SORIKU_ENGINE_FIRST_RUN_COMPLETE } from './soriku-workbench-preferences';

/** Command id of the hosted (Simezu) sign-in flow, contributed by soriku-auth. */
const SORIKU_AUTH_CONNECT = 'soriku.auth.connect';

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

    @inject(CommandService)
    protected readonly commands: CommandService;

    async onStart(): Promise<void> {
        this.status.onDidChangeState(state => this.updateStatusBar(state));
        this.updateStatusBar(this.status.getState());
        // Wait for stored user settings before reading the first-run flag, otherwise
        // the schema default (false) is read and the prompt reappears every launch.
        await this.preferences.ready;
        if (!this.preferences.get<boolean>(SORIKU_ENGINE_FIRST_RUN_COMPLETE, false)) {
            await this.promptFirstRun();
            return;
        }
        // Fire-and-forget: the engine ping is a network round-trip that must not
        // block Theia's sequential onStart chain — the status bar already
        // reflects "connecting…" and updates again via onDidChangeState once the
        // ping settles, so nothing downstream needs this to be awaited.
        this.autoConnect().catch(() => { /* connect() never rejects; guards future changes */ });
    }

    protected async autoConnect(): Promise<void> {
        if (this.preferences.get<boolean>(SORIKU_ENGINE_AUTOCONNECT, true)) {
            await this.status.connect();
        }
    }

    /** Ask the user how to connect on the very first launch (connect-local / use-hosted / skip). */
    protected async promptFirstRun(): Promise<void> {
        const pick = await this.quickInput.showQuickPick(
            [
                { label: '$(plug) Connect to the local engine', description: DEFAULT_ENGINE_BASE_URL, id: 'local' },
                { label: '$(cloud) Use a hosted engine', description: 'Sign in with Simezu', id: 'hosted' },
                { label: '$(circle-slash) Skip for now', description: 'Connect later from the status bar', id: 'skip' },
            ],
            { title: 'Welcome to Soriku IDE — connect to the engine' },
        );
        if (!pick) {
            // Dismissed: connect this session as usual, prompt again next launch.
            await this.autoConnect();
            return;
        }
        await this.preferences.set(SORIKU_ENGINE_FIRST_RUN_COMPLETE, true, PreferenceScope.User);
        const action = firstRunAction(pick.id as FirstRunChoice, DEFAULT_ENGINE_BASE_URL);
        if (action.setBaseUrl) {
            await this.preferences.set(SORIKU_ENGINE_BASE_URL, action.setBaseUrl, PreferenceScope.User);
        }
        if (action.startHostedAuth) {
            await this.commands.executeCommand(SORIKU_AUTH_CONNECT);
        }
        if (action.connect) {
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
        const { tooltip } = computeEngineStatusView(state);
        this.statusBar.setElement(SORIKU_ENGINE_STATUS_ID, {
            text: `$(circle-filled) ${engineStatusBarLabel(state)}`,
            tooltip,
            alignment: StatusBarAlignment.LEFT,
            command: SorikuEngineCommands.MANAGE.id,
            priority: 110,
            color: 'var(--acc)',
            backgroundColor: 'var(--acc-soft)',
            className: `soriku-engine-statusbar soriku-engine-statusbar-${state.status}`,
        });
    }
}
