/********************************************************************************
 * Soriku IDE — General settings page (Engine / Privacy / Appearance / Models),
 * 1:1 from the mockup's settingsGroups, bound to real preferences and engine data.
 *
 * SPDX-License-Identifier: MIT
 ********************************************************************************/

import * as React from '@theia/core/shared/react';
import { inject, injectable, postConstruct } from '@theia/core/shared/inversify';
import { ReactWidget } from '@theia/core/lib/browser/widgets/react-widget';
import { CommandRegistry, PreferenceScope, PreferenceService } from '@theia/core/lib/common';
import { QuickInputService } from '@theia/core/lib/browser';
import { ApplicationServer } from '@theia/core/lib/common/application-protocol';
import { ThemeService } from '@theia/core/lib/browser/theming';
import { WindowService } from '@theia/core/lib/browser/window/window-service';
import { EngineClient } from 'soriku-engine-client-ext/lib/common/engine-client';
import { BillingPlansResponse, SimezuGroup, WhoamiResponse } from 'soriku-engine-client-ext/lib/common/engine-types';
import { Btn, Card, PageHeader, Pill, PillValue, PillValueButton, SegmentedPicker, SettingsGroup, SettingsRow, Toggle } from 'soriku-theme-ext/lib/browser/ui';
import { SORIKU_DARK_THEME_ID, SORIKU_LIGHT_THEME_ID } from 'soriku-theme-ext/lib/browser/soriku-theme-contribution';
import { SORIKU_ACTIVE_GROUP_ID, SORIKU_ENGINE_BASE_URL } from 'soriku-engine-client-ext/lib/browser/soriku-engine-preferences';
import { SorikuAuthService } from 'soriku-auth-ext/lib/browser/soriku-auth-service';
import { computeStatusView } from 'soriku-auth-ext/lib/common/auth-status';
import { shortHost } from '../common/engine-status';
import { connectionLabel, countWarmModels, engineErrorMessage, featureLabel, formatCostCap, WarmModelsCount } from '../common/settings-view';
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

    @inject(CommandRegistry)
    protected readonly commands: CommandRegistry;

    @inject(ApplicationServer)
    protected readonly applicationServer: ApplicationServer;

    @inject(ThemeService)
    protected readonly themeService: ThemeService;

    @inject(EngineClient)
    protected readonly engineClient: EngineClient;

    @inject(SorikuEngineStatusService)
    protected readonly engineStatus: SorikuEngineStatusService;

    @inject(SorikuAuthService)
    protected readonly authService: SorikuAuthService;

    @inject(WindowService)
    protected readonly windowService: WindowService;

    protected version?: string;
    protected warmModels: WarmModelsCount = { warm: 0, total: 0 };
    protected billingPlans: BillingPlansResponse | undefined;
    protected billingLoading = false;
    protected billingError: string | undefined;
    protected whoami: WhoamiResponse | undefined;
    protected checkoutLoading: string | undefined;
    protected portalLoading = false;

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
        this.toDispose.push(this.authService.onDidChangeState(() => { this.update(); this.refreshBilling(); }));
        this.applicationServer.getApplicationInfo().then(info => {
            this.version = info?.version;
            this.update();
        });
        this.refreshModels();
        this.refreshBilling();
        this.update();
    }

    protected async refreshBilling(): Promise<void> {
        this.billingLoading = true;
        this.billingError = undefined;
        this.update();
        try {
            const [plans, whoami] = await Promise.all([
                this.engineClient.getBillingPlans(),
                this.engineClient.whoami().catch(() => undefined),
            ]);
            this.billingPlans = plans;
            this.whoami = whoami;
        } catch (e) {
            this.billingError = engineErrorMessage(e);
        } finally {
            this.billingLoading = false;
            this.update();
        }
    }

    protected async doUpgrade(plan: string): Promise<void> {
        this.checkoutLoading = plan;
        this.update();
        try {
            const { checkout_url } = await this.engineClient.createCheckout({ plan });
            this.windowService.openNewWindow(checkout_url);
        } catch (e) {
            this.billingError = engineErrorMessage(e);
        } finally {
            this.checkoutLoading = undefined;
            this.update();
        }
    }

    protected async doManageBilling(): Promise<void> {
        this.portalLoading = true;
        this.update();
        try {
            const { portal_url } = await this.engineClient.getBillingPortal();
            this.windowService.openNewWindow(portal_url);
        } catch (e) {
            this.billingError = engineErrorMessage(e);
        } finally {
            this.portalLoading = false;
            this.update();
        }
    }

    protected switchGroup(groupId: string): void {
        this.preferences.set(SORIKU_ACTIVE_GROUP_ID, groupId, PreferenceScope.User);
    }

    protected connectOrManage = (): void => {
        this.commands.executeCommand(this.authService.getState().hasToken ? 'soriku.auth.manage' : 'soriku.auth.connect');
    };

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
        const subhead = [`Soriku Code${versionLabel ? ' · ' + versionLabel : ''}`, `engine ${shortHost(baseUrl)}`, 'runs entirely on this machine.'].join(' · ');

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

                {this.renderUpdatesGroup()}

                <SettingsGroup title='Account'>
                    <SettingsRow
                        label='Status'
                        description={computeStatusView(this.authService.getState()).tooltip}
                        control={<Btn variant='secondary' onClick={this.connectOrManage}>
                            {computeStatusView(this.authService.getState()).text}
                        </Btn>}
                    />
                </SettingsGroup>

                {this.renderPlanSection()}
                {this.renderTeamsGroup()}
            </div>
        </div>;
    }

    /**
     * Real plan cards from /api/billing/plans — price, features and capability
     * gates come straight from core/billing/plans.py, nothing hardcoded here.
     */
    protected renderPlanSection(): React.ReactNode {
        return <div className='soriku-settings-plans'>
            <div className='sk-page-section-label'>
                <span className='sk-page-section-label-text'>Plan</span>
                <span className='sk-page-section-label-rule' />
                <Btn variant='ghost' onClick={() => this.doManageBilling()}>
                    {this.portalLoading ? 'Opening…' : 'Manage billing'}
                </Btn>
            </div>
            {this.billingLoading && !this.billingPlans && <div className='soriku-settings-plans-loading'>Loading plans…</div>}
            {this.billingError && <div className='soriku-settings-plans-error'>{this.billingError}</div>}
            {this.billingPlans && <div className='soriku-settings-plans-grid'>
                {Object.entries(this.billingPlans.plans).map(([key, plan]) => {
                    const current = key === this.billingPlans!.current_plan;
                    const price = plan.pricing.founder_active ? plan.pricing.founder_price : plan.pricing.price;
                    return <Card key={key} className={`soriku-settings-plan-card${current ? ' current' : ''}`}>
                        <div className='soriku-settings-plan-head'>
                            <span className='soriku-settings-plan-name'>{plan.name}</span>
                            {current && <Pill tone='acc'>Current</Pill>}
                        </div>
                        <div className='soriku-settings-plan-price'>
                            {price === 0 ? 'Free' : `€${price}`}
                            {price !== 0 && <span className='soriku-settings-plan-unit'>/{plan.billing_unit === 'seat' ? 'seat' : 'mo'}</span>}
                            {plan.pricing.founder_active && <span className='soriku-settings-plan-founder'>founder price</span>}
                        </div>
                        <ul className='soriku-settings-plan-features'>
                            {plan.features.map(f => <li key={f}>{featureLabel(f)}</li>)}
                        </ul>
                        {!current && <Btn onClick={() => this.doUpgrade(key)} disabled={!!this.checkoutLoading}>
                            {this.checkoutLoading === key ? 'Opening…' : 'Upgrade'}
                        </Btn>}
                    </Card>;
                })}
            </div>}
        </div>;
    }

    /** Only shown when there's an actual choice — a single group needs no switcher. */
    protected renderTeamsGroup(): React.ReactNode {
        const groups: SimezuGroup[] = this.whoami?.available_groups ?? [];
        if (groups.length < 2) {
            return undefined;
        }
        const activeGroupId = this.preferences.get<string>(SORIKU_ACTIVE_GROUP_ID, '');
        return <SettingsGroup title='Teams'>
            {groups.map(group => <SettingsRow
                key={group.id}
                label={group.name}
                description={group.role ? `Your role: ${group.role}` : 'Simezu group'}
                control={activeGroupId === group.id
                    ? <Pill tone='acc'>Active</Pill>
                    : <Btn variant='ghost' onClick={() => this.switchGroup(group.id)}>Switch</Btn>}
            />)}
        </SettingsGroup>;
    }

    /**
     * The updater (theia-ide-updater-ext) only binds in the Electron target
     * (`frontendElectron` in its package.json) — this group simply doesn't
     * exist in the browser dev-harness build, rather than showing a "Check
     * for updates" button that would silently do nothing.
     */
    protected renderUpdatesGroup(): React.ReactNode {
        if (!this.commands.getCommand('electron-theia:check-for-updates')) {
            return undefined;
        }
        const channel = this.preferences.get<string>('updates.channel', 'stable');
        return <SettingsGroup title='Updates'>
            <SettingsRow
                label='Version'
                description={`Update channel: ${channel}`}
                control={<PillValue>{this.version ? `v${this.version}` : '—'}</PillValue>}
            />
            <SettingsRow
                label='Check for updates'
                description='Soriku Code checks soriku.com for a newer build'
                control={<Btn variant='secondary' onClick={() => this.commands.executeCommand('electron-theia:check-for-updates')}>
                    Check now
                </Btn>}
            />
        </SettingsGroup>;
    }
}
