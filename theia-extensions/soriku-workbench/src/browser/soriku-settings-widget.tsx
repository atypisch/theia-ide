/********************************************************************************
 * Soriku IDE — General settings page (Engine / Privacy / Appearance / Models),
 * 1:1 from the mockup's settingsGroups, bound to real preferences and engine data.
 *
 * SPDX-License-Identifier: MIT
 ********************************************************************************/

import * as React from '@theia/core/shared/react';
import { inject, injectable, postConstruct } from '@theia/core/shared/inversify';
import { ReactWidget } from '@theia/core/lib/browser/widgets/react-widget';
import { CommandService, PreferenceScope, PreferenceService } from '@theia/core/lib/common';
import { QuickInputService } from '@theia/core/lib/browser';
import { ApplicationServer } from '@theia/core/lib/common/application-protocol';
import { ThemeService } from '@theia/core/lib/browser/theming';
import { EngineClient } from 'soriku-engine-client-ext/lib/common/engine-client';
import { Btn, PageHeader, Pill, PillValue, PillValueButton, SegmentedPicker, SettingsGroup, SettingsRow, Toggle } from 'soriku-theme-ext/lib/browser/ui';
import { SORIKU_DARK_THEME_ID, SORIKU_LIGHT_THEME_ID } from 'soriku-theme-ext/lib/browser/soriku-theme-contribution';
import { SORIKU_ENGINE_BASE_URL } from 'soriku-engine-client-ext/lib/browser/soriku-engine-preferences';
import { shortHost } from '../common/engine-status';
import { connectionLabel, countWarmModels, formatCostCap, WarmModelsCount } from '../common/settings-view';
import { SORIKU_ENGINE_AUTOCONNECT, SORIKU_ROUTING_CLOUD_CAP_EUR } from './soriku-workbench-preferences';
import { SorikuEngineStatusService } from './soriku-engine-status-service';

const SORIKU_COMPLETION_INLINE_ENABLED = 'soriku.completion.inlineEnabled';

@injectable()
export class SorikuSettingsWidget extends ReactWidget {

    static readonly ID = 'soriku-settings';
    static readonly LABEL = 'Soriku Settings';

    @inject(PreferenceService)
    protected readonly preferences: PreferenceService;

    @inject(QuickInputService)
    protected readonly quickInput: QuickInputService;

    @inject(CommandService)
    protected readonly commands: CommandService;

    @inject(ApplicationServer)
    protected readonly applicationServer: ApplicationServer;

    @inject(ThemeService)
    protected readonly themeService: ThemeService;

    @inject(EngineClient)
    protected readonly engineClient: EngineClient;

    @inject(SorikuEngineStatusService)
    protected readonly engineStatus: SorikuEngineStatusService;

    protected version?: string;
    protected warmModels: WarmModelsCount = { warm: 0, total: 0 };

    @postConstruct()
    protected init(): void {
        this.id = SorikuSettingsWidget.ID;
        this.title.label = SorikuSettingsWidget.LABEL;
        this.title.caption = SorikuSettingsWidget.LABEL;
        this.title.iconClass = 'codicon codicon-settings-gear';
        this.title.closable = true;
        this.node.tabIndex = 0;
        this.addClass('soriku-settings-widget');
        this.toDispose.push(this.preferences.onPreferenceChanged(() => this.update()));
        this.toDispose.push(this.themeService.onDidColorThemeChange(() => this.update()));
        this.toDispose.push(this.engineStatus.onDidChangeState(() => this.update()));
        this.applicationServer.getApplicationInfo().then(info => {
            this.version = info?.version;
            this.update();
        });
        this.refreshModels();
        this.update();
    }

    protected async refreshModels(): Promise<void> {
        try {
            const { models } = await this.engineClient.listInstalledModels();
            this.warmModels = countWarmModels(models);
        } catch {
            this.warmModels = { warm: 0, total: 0 };
        }
        this.update();
    }

    protected async editEngineUrl(): Promise<void> {
        const current = this.preferences.get<string>(SORIKU_ENGINE_BASE_URL, this.engineClient.getBaseUrl());
        const value = await this.quickInput.input({ title: 'Engine URL', value: current, prompt: 'Base URL of the Soriku engine' });
        if (value && value.trim()) {
            await this.preferences.set(SORIKU_ENGINE_BASE_URL, value.trim(), PreferenceScope.User);
        }
    }

    protected async editCostCap(): Promise<void> {
        const current = this.preferences.get<number>(SORIKU_ROUTING_CLOUD_CAP_EUR, -1);
        const value = await this.quickInput.input({
            title: 'Per-request cost cap (EUR)',
            value: String(current),
            prompt: 'A negative value uses the engine\'s own default (€1.00/plan, €3.00/day)',
        });
        if (value === undefined || value.trim() === '') {
            return;
        }
        const parsed = Number(value);
        if (!Number.isNaN(parsed)) {
            await this.preferences.set(SORIKU_ROUTING_CLOUD_CAP_EUR, parsed, PreferenceScope.User);
        }
    }

    protected setTheme(id: string): void {
        this.themeService.setCurrentTheme(id);
    }

    protected openModels = (): void => {
        this.commands.executeCommand('soriku.models.open');
    };

    protected render(): React.ReactNode {
        const baseUrl = this.preferences.get<string>(SORIKU_ENGINE_BASE_URL, this.engineClient.getBaseUrl());
        const autoConnect = this.preferences.get<boolean>(SORIKU_ENGINE_AUTOCONNECT, true);
        const costCap = this.preferences.get<number>(SORIKU_ROUTING_CLOUD_CAP_EUR, -1);
        const inlineCompletion = this.preferences.get<boolean>(SORIKU_COMPLETION_INLINE_ENABLED, true);
        const themeId = this.themeService.getCurrentTheme().id;
        const state = this.engineStatus.getState();
        const versionLabel = this.version ? `v${this.version}` : '';
        const subhead = [`Soriku IDE${versionLabel ? ' · ' + versionLabel : ''}`, `engine ${shortHost(baseUrl)}`, 'runs entirely on this machine.'].join(' · ');

        return <div className='sk-page soriku-settings'>
            <PageHeader eyebrow='Preferences' heading='General' emphasis='settings' subhead={subhead} />
            <div className='sk-page-body sk-page-body-narrow soriku-settings-body'>
                <SettingsGroup title='Engine'>
                    <SettingsRow
                        label='Engine URL'
                        description='Local Soriku engine endpoint'
                        control={<PillValueButton onClick={() => this.editEngineUrl()} title='Click to edit'>{baseUrl}</PillValueButton>}
                    />
                    <SettingsRow
                        label='Auto-connect on startup'
                        description='Connect to the Soriku engine automatically when the IDE starts'
                        control={<Toggle on={autoConnect} onChange={next => this.preferences.set(SORIKU_ENGINE_AUTOCONNECT, next, PreferenceScope.User)} />}
                    />
                    <SettingsRow
                        label='Connection'
                        description='Live status of the local engine connection'
                        control={<Pill tone={state.status === 'connected' ? 'ok' : state.status === 'unreachable' ? 'danger' : 'default'}>
                            {connectionLabel(state.status)}
                        </Pill>}
                    />
                </SettingsGroup>

                <SettingsGroup title='Privacy'>
                    <SettingsRow
                        label='Telemetry'
                        description='No usage data ever leaves your machine'
                        control={<Toggle on={false} locked />}
                    />
                    <SettingsRow
                        label='Routing default'
                        description='Chosen per message in chat — nothing leaves this machine unless you pick otherwise'
                        control={<Pill tone='acc'>Local-first</Pill>}
                    />
                    <SettingsRow
                        label='Per-request cost cap'
                        description='Hard limit on cloud spend before any remote call'
                        control={<PillValueButton onClick={() => this.editCostCap()} title='Click to edit'>{formatCostCap(costCap)}</PillValueButton>}
                    />
                </SettingsGroup>

                <SettingsGroup title='Appearance'>
                    <SettingsRow
                        label='Theme'
                        description='Light and dark follow Theia tokens'
                        control={<SegmentedPicker
                            options={[{ value: SORIKU_DARK_THEME_ID, label: 'Dark' }, { value: SORIKU_LIGHT_THEME_ID, label: 'Light' }]}
                            value={themeId === SORIKU_LIGHT_THEME_ID ? SORIKU_LIGHT_THEME_ID : SORIKU_DARK_THEME_ID}
                            onChange={next => this.setTheme(next)}
                        />}
                    />
                    <SettingsRow
                        label='Accent'
                        description='Brand flame-orange'
                        control={<span className='soriku-settings-accent-swatch' />}
                    />
                </SettingsGroup>

                <SettingsGroup title='Models'>
                    <SettingsRow
                        label='Warm models'
                        description='Currently loaded in memory, ready to answer instantly'
                        control={<span className='soriku-settings-warm-row'>
                            <PillValue>{`${this.warmModels.warm} of ${this.warmModels.total}`}</PillValue>
                            <Btn variant='ghost' onClick={this.openModels}>Manage</Btn>
                        </span>}
                    />
                    <SettingsRow
                        label='Inline completion'
                        description='Ghost-text FIM from a local model'
                        control={<Toggle on={inlineCompletion} onChange={next => this.preferences.set(SORIKU_COMPLETION_INLINE_ENABLED, next, PreferenceScope.User)} />}
                    />
                </SettingsGroup>
            </div>
        </div>;
    }
}
