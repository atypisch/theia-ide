/********************************************************************************
 * Soriku IDE — Manage Models view (providers, installed models, pull, browse)
 *
 * SPDX-License-Identifier: MIT
 ********************************************************************************/

import * as React from '@theia/core/shared/react';
import { inject, injectable, postConstruct } from '@theia/core/shared/inversify';
import { ReactWidget } from '@theia/core/lib/browser/widgets/react-widget';
import { MessageService } from '@theia/core/lib/common';
import { ConfirmDialog } from '@theia/core/lib/browser/dialogs';
import { EngineClient } from 'soriku-engine-client-ext/lib/common/engine-client';
import { SorikuModelCatalog } from 'soriku-engine-client-ext/lib/browser/soriku-model-catalog';
import {
    BrowseModel, InstalledModel, ProviderInfo, ProviderPreset, UserProvider,
} from 'soriku-engine-client-ext/lib/common/engine-types';
import { Btn, PageHeader } from 'soriku-theme-ext/lib/browser/ui';
import { SorikuToastService } from 'soriku-theme-ext/lib/browser/soriku-toast-service';
import { formatModelSize, isValidOllamaName, parsePullEvent } from '../common/models-view';

@injectable()
export class SorikuModelsWidget extends ReactWidget {

    static readonly ID = 'soriku-models';
    static readonly LABEL = 'Manage Models';

    @inject(EngineClient)
    protected readonly engineClient: EngineClient;

    @inject(MessageService)
    protected readonly messages: MessageService;

    @inject(SorikuModelCatalog)
    protected readonly catalog: SorikuModelCatalog;

    @inject(SorikuToastService)
    protected readonly toast: SorikuToastService;

    protected providers: ProviderInfo[] = [];
    protected userProviders: UserProvider[] = [];
    protected presets: ProviderPreset[] = [];
    protected installed: InstalledModel[] = [];
    protected loading = true;
    protected error?: string;

    // Pull
    protected pullName = '';
    protected pulling = false;
    protected pullStatus = '';
    protected pullPercent?: number;

    // Add provider
    protected presetId = '';
    protected apiKey = '';
    protected baseUrl = '';
    protected displayName = '';
    protected adding = false;

    // Browse
    protected browseQuery = '';
    protected browsing = false;
    protected browseResults: BrowseModel[] = [];
    protected installingIds = new Set<string>();
    protected busyModelIds = new Set<string>();

    protected readonly pullInputRef = React.createRef<HTMLInputElement>();
    protected readonly addProviderRef = React.createRef<HTMLSelectElement>();

    @postConstruct()
    protected init(): void {
        this.id = SorikuModelsWidget.ID;
        this.title.label = SorikuModelsWidget.LABEL;
        this.title.caption = SorikuModelsWidget.LABEL;
        this.title.iconClass = 'codicon codicon-server-environment';
        this.title.closable = true;
        this.node.tabIndex = 0;
        this.addClass('soriku-models-widget');
        this.update();
        this.refresh();
    }

    async refresh(): Promise<void> {
        this.loading = true;
        this.error = undefined;
        this.update();
        try {
            const [providers, installed, presets, userProviders] = await Promise.all([
                this.engineClient.listProviders().catch(() => ({ providers: [] })),
                this.engineClient.listInstalledModels().catch(() => ({ models: [] })),
                this.engineClient.listProviderPresets().catch(() => ({ presets: [] })),
                this.engineClient.listUserProviders().catch(() => ({ providers: [] })),
            ]);
            this.providers = providers.providers ?? [];
            this.installed = installed.models ?? [];
            this.presets = presets.presets ?? [];
            this.userProviders = userProviders.providers ?? [];
        } catch (e) {
            this.error = (e as Error).message;
        }
        this.loading = false;
        this.update();
    }

    /** Refresh and notify other views (chat pickers) that the catalog changed. */
    protected async mutated(): Promise<void> {
        await this.refresh();
        this.catalog.notifyChanged();
    }

    // ── Pull ────────────────────────────────────────────────────────
    protected async pull(): Promise<void> {
        const name = this.pullName.trim();
        if (!isValidOllamaName(name) || this.pulling) {
            if (name) {
                this.messages.warn(`"${name}" is not a valid model name.`);
            }
            return;
        }
        this.pulling = true;
        this.pullStatus = 'starting…';
        this.pullPercent = undefined;
        this.update();
        try {
            for await (const event of this.engineClient.pullModel(name)) {
                const p = parsePullEvent(event);
                this.pullStatus = p.message;
                this.pullPercent = p.percent;
                this.update();
                if (p.error) {
                    this.messages.error(`Pull failed: ${p.error}`);
                }
            }
            this.messages.info(`Pulled ${name}.`);
            this.pullName = '';
        } catch (e) {
            this.messages.error(`Pull failed: ${(e as Error).message}`);
        } finally {
            this.pulling = false;
            this.pullStatus = '';
            this.pullPercent = undefined;
            await this.mutated();
        }
    }

    // ── Installed-model actions ─────────────────────────────────────
    protected async setActive(model: InstalledModel, active: boolean): Promise<void> {
        this.busyModelIds.add(model.id);
        this.update();
        try {
            if (active) {
                await this.engineClient.activateModel(model.id);
            } else {
                await this.engineClient.deactivateModel(model.id);
            }
            await this.mutated();
            this.toast.show(`${model.id} ${active ? 'activated' : 'deactivated'}`);
        } catch (e) {
            this.messages.error(`Could not update ${model.id}: ${(e as Error).message}`);
        } finally {
            this.busyModelIds.delete(model.id);
            this.update();
        }
    }

    protected async remove(model: InstalledModel): Promise<void> {
        const ok = await new ConfirmDialog({
            title: 'Delete model',
            msg: `Delete ${model.id} from disk? This removes the local weights.`,
            ok: 'Delete',
            cancel: 'Cancel',
        }).open();
        if (ok !== true) {
            return;
        }
        this.busyModelIds.add(model.id);
        this.update();
        try {
            await this.engineClient.deleteModel(model.id);
            await this.mutated();
            this.messages.info(`Deleted ${model.id}.`);
        } catch (e) {
            this.messages.error(`Could not delete ${model.id}: ${(e as Error).message}`);
        } finally {
            this.busyModelIds.delete(model.id);
            this.update();
        }
    }

    // ── Browse / install ────────────────────────────────────────────
    protected async browse(): Promise<void> {
        const q = this.browseQuery.trim();
        if (!q || this.browsing) {
            return;
        }
        this.browsing = true;
        this.update();
        try {
            const result = await this.engineClient.browseModels(q);
            this.browseResults = result.models ?? [];
        } catch (e) {
            this.messages.error(`Browse failed: ${(e as Error).message}`);
        } finally {
            this.browsing = false;
            this.update();
        }
    }

    protected async installBrowsed(model: BrowseModel): Promise<void> {
        this.installingIds.add(model.model_id);
        this.update();
        try {
            for await (const event of this.engineClient.pullModel(model.model_id)) {
                const p = parsePullEvent(event);
                if (p.error) {
                    this.messages.error(`Install failed: ${p.error}`);
                }
            }
            this.messages.info(`Installed ${model.model_id}.`);
            await this.mutated();
        } catch (e) {
            this.messages.error(`Install failed: ${(e as Error).message}`);
        } finally {
            this.installingIds.delete(model.model_id);
            this.update();
        }
    }

    // ── Add provider ────────────────────────────────────────────────
    protected get selectedPreset(): ProviderPreset | undefined {
        return this.presets.find(p => p.id === this.presetId);
    }

    protected async addProvider(): Promise<void> {
        const preset = this.selectedPreset;
        const isCustom = this.presetId === 'custom' || !preset;
        if (this.adding) {
            return;
        }
        if (!this.presetId) {
            this.messages.warn('Pick a provider first.');
            return;
        }
        if (!isCustom && !this.apiKey.trim()) {
            this.messages.warn('Enter the API key.');
            return;
        }
        if (isCustom && !this.baseUrl.trim()) {
            this.messages.warn('Enter the base URL for the custom endpoint.');
            return;
        }
        this.adding = true;
        this.update();
        try {
            await this.engineClient.addProvider({
                preset_id: isCustom ? undefined : this.presetId,
                display_name: this.displayName.trim() || preset?.display_name || 'Custom',
                base_url: isCustom ? this.baseUrl.trim() : preset?.base_url,
                api_key: this.apiKey.trim() || undefined,
                is_local: false,
            });
            this.messages.info('Provider added.');
            this.presetId = '';
            this.apiKey = '';
            this.baseUrl = '';
            this.displayName = '';
            await this.mutated();
        } catch (e) {
            this.messages.error(`Could not add provider: ${(e as Error).message}`);
        } finally {
            this.adding = false;
            this.update();
        }
    }

    protected async removeProvider(provider: UserProvider): Promise<void> {
        const ok = await new ConfirmDialog({
            title: 'Remove provider',
            msg: `Remove ${provider.display_name} and its API key?`,
            ok: 'Remove',
            cancel: 'Cancel',
        }).open();
        if (ok !== true) {
            return;
        }
        try {
            await this.engineClient.deleteUserProvider(provider.id);
            await this.mutated();
            this.messages.info(`Removed ${provider.display_name}.`);
        } catch (e) {
            this.messages.error(`Could not remove provider: ${(e as Error).message}`);
        }
    }

    protected focusAndScroll(ref: React.RefObject<HTMLElement>): void {
        ref.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        ref.current?.focus();
    }

    // ── Render ──────────────────────────────────────────────────────
    protected render(): React.ReactNode {
        return <div className='sk-page soriku-models'>
            <PageHeader
                eyebrow='Soriku engine'
                heading='Your'
                emphasis='AI stack'
                subhead='The brains behind every prompt. Local-first — cloud is opt-in and capped in EUR, never silent.'
                actions={<>
                    <Btn variant='secondary' onClick={() => this.focusAndScroll(this.pullInputRef)}>
                        <span className='codicon codicon-arrow-down' /> Pull model
                    </Btn>
                    <Btn variant='primary' onClick={() => this.focusAndScroll(this.addProviderRef)}>Add provider</Btn>
                    <Btn variant='secondary' onClick={() => this.refresh()}>
                        <span className='codicon codicon-refresh' />
                    </Btn>
                </>}
            />
            <div className='sk-page-body sk-page-body-narrow soriku-models-body'>
                {this.error && <div className='soriku-models-error'>{this.error}</div>}
                {this.renderProviders()}
                {this.renderPull()}
                {this.renderInstalled()}
                {this.renderBrowse()}
            </div>
        </div>;
    }

    protected renderProviders(): React.ReactNode {
        const userById = new Map(this.userProviders.map(p => [p.display_name, p]));
        return <section className='soriku-models-section'>
            <h3>Providers</h3>
            <ul className='soriku-models-list'>
                {this.providers.map(p => {
                    const removable = userById.get(p.display_name);
                    return <li key={p.name} className='soriku-models-row'>
                        <span className={`soriku-dot ${p.healthy ? 'ok' : 'bad'}`} />
                        <span className='soriku-models-name'>{p.display_name}</span>
                        <span className='soriku-models-meta'>
                            {p.healthy ? `${p.models_available} models` : (p.error || 'unavailable')}
                        </span>
                        {removable && <button className='soriku-iconbtn' title='Remove provider' onClick={() => this.removeProvider(removable)}>
                            <span className='codicon codicon-trash' />
                        </button>}
                    </li>;
                })}
            </ul>
            {this.renderAddProvider()}
        </section>;
    }

    protected renderAddProvider(): React.ReactNode {
        const isCustom = this.presetId === 'custom';
        return <div className='soriku-models-addprovider'>
            <select ref={this.addProviderRef} className='theia-select' value={this.presetId} disabled={this.adding}
                onChange={e => { this.presetId = e.target.value; this.update(); }}>
                <option value=''>Add a provider…</option>
                {this.presets.map(p => <option key={p.id} value={p.id}>{p.display_name}</option>)}
                <option value='custom'>Custom (OpenAI-compatible)</option>
            </select>
            {this.presetId && <div className='soriku-models-form'>
                {isCustom && <input className='theia-input' placeholder='Display name'
                    value={this.displayName} disabled={this.adding}
                    onChange={e => { this.displayName = e.target.value; this.update(); }} />}
                {isCustom && <input className='theia-input' placeholder='Base URL (https://…/v1)'
                    value={this.baseUrl} disabled={this.adding}
                    onChange={e => { this.baseUrl = e.target.value; this.update(); }} />}
                <input className='theia-input' type='password' placeholder='API key'
                    value={this.apiKey} disabled={this.adding}
                    onChange={e => { this.apiKey = e.target.value; this.update(); }} />
                {!isCustom && this.selectedPreset?.api_key_url &&
                    <a className='soriku-models-link' href={this.selectedPreset.api_key_url} target='_blank' rel='noreferrer'>Get an API key</a>}
                <button className='theia-button' disabled={this.adding} onClick={() => this.addProvider()}>
                    {this.adding ? 'Adding…' : 'Add provider'}
                </button>
            </div>}
        </div>;
    }

    protected renderPull(): React.ReactNode {
        return <section className='soriku-models-section'>
            <h3>Pull a local model</h3>
            <div className='soriku-models-inline'>
                <input ref={this.pullInputRef} className='theia-input' placeholder='Ollama model (e.g. llama3.2)'
                    value={this.pullName} disabled={this.pulling}
                    onChange={e => { this.pullName = e.target.value; this.update(); }}
                    onKeyDown={e => { if (e.key === 'Enter') { this.pull(); } }} />
                <button className='theia-button' disabled={this.pulling} onClick={() => this.pull()}>
                    {this.pulling ? 'Pulling…' : 'Pull'}
                </button>
            </div>
            {this.pulling && <div className='soriku-models-progress'>
                <span>{this.pullStatus}</span>
                {this.pullPercent !== undefined && <span className='soriku-models-pct'>{this.pullPercent}%</span>}
            </div>}
        </section>;
    }

    protected renderInstalled(): React.ReactNode {
        const models = this.installed.filter(m => !m.is_embedding);
        return <section className='soriku-models-section'>
            <h3>Installed models</h3>
            {this.loading && models.length === 0
                ? <div className='soriku-models-meta'>Loading…</div>
                : <ul className='soriku-models-list'>
                    {models.map(m => {
                        const busy = this.busyModelIds.has(m.id);
                        const active = !m.inactive;
                        return <li key={m.id} className='soriku-models-row'>
                            <span className='soriku-models-name' title={m.id}>{m.id}</span>
                            <span className='soriku-models-meta'>
                                {[m.role, formatModelSize(m.size_gb)].filter(Boolean).join(' · ')}
                            </span>
                            <button className='soriku-iconbtn' disabled={busy}
                                title={active ? 'Deactivate (hide from routing)' : 'Activate'}
                                onClick={() => this.setActive(m, !active)}>
                                <span className={`codicon ${active ? 'codicon-eye' : 'codicon-eye-closed'}`} />
                            </button>
                            <button className='soriku-iconbtn' disabled={busy} title='Delete from disk'
                                onClick={() => this.remove(m)}>
                                <span className='codicon codicon-trash' />
                            </button>
                        </li>;
                    })}
                    {models.length === 0 && <li className='soriku-models-meta'>No models installed.</li>}
                </ul>}
        </section>;
    }

    protected renderBrowse(): React.ReactNode {
        return <section className='soriku-models-section'>
            <h3>Browse the library</h3>
            <div className='soriku-models-inline'>
                <input className='theia-input' placeholder='Search models…'
                    value={this.browseQuery} disabled={this.browsing}
                    onChange={e => { this.browseQuery = e.target.value; this.update(); }}
                    onKeyDown={e => { if (e.key === 'Enter') { this.browse(); } }} />
                <button className='theia-button secondary' disabled={this.browsing} onClick={() => this.browse()}>
                    {this.browsing ? 'Searching…' : 'Search'}
                </button>
            </div>
            <ul className='soriku-models-list'>
                {this.browseResults.map(m => {
                    const installing = this.installingIds.has(m.model_id);
                    const local = (m.provider === 'ollama') || (m.source === 'ollama') || (m.cost_type === 'free_local');
                    return <li key={`${m.source}-${m.model_id}`} className='soriku-models-row'>
                        <span className='soriku-models-name' title={m.description || m.model_id}>{m.model_id}</span>
                        <span className='soriku-models-meta'>{[m.parameters, m.cost_label].filter(Boolean).join(' · ')}</span>
                        {m.is_installed
                            ? <span className='soriku-models-meta'>installed</span>
                            : local
                                ? <button className='soriku-iconbtn' disabled={installing} title='Install (pull)'
                                    onClick={() => this.installBrowsed(m)}>
                                    {installing ? <span className='codicon codicon-loading codicon-modifier-spin' /> : <span className='codicon codicon-cloud-download' />}
                                </button>
                                : <span className='soriku-models-meta' title='Add this provider above to use it'>{m.provider}</span>}
                    </li>;
                })}
            </ul>
        </section>;
    }
}
