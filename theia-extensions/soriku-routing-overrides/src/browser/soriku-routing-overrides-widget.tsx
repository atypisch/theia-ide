/********************************************************************************
 * Soriku IDE — routing overrides widget (user-level)
 *
 * SPDX-License-Identifier: MIT
 ********************************************************************************/

import * as React from '@theia/core/shared/react';
import { inject, injectable, postConstruct } from '@theia/core/shared/inversify';
import { ReactWidget } from '@theia/core/lib/browser/widgets/react-widget';
import { MessageService } from '@theia/core/lib/common';
import { QuickInputService, QuickPickItem } from '@theia/core/lib/browser';
import { EngineClient } from 'soriku-engine-client-ext/lib/common/engine-client';
import { toCapabilityTable } from 'soriku-capability-map-ext/lib/common/capability-table';
import { Btn, PageHeader, categoryColors, toKnownCategory } from 'soriku-theme-ext/lib/browser/ui';
import {
    OverrideRow,
    RoutingCategoryRow,
    mergeCategoryRows,
    parseModelIds,
    parseOverrides,
} from '../common/routing-overrides';

interface OverridesState {
    status: 'loading' | 'error' | 'ready';
    overrides: OverrideRow[];
    categories: string[];
    models: string[];
    error?: string;
}

@injectable()
export class SorikuRoutingOverridesWidget extends ReactWidget {

    static readonly ID = 'soriku-routing-overrides';
    static readonly LABEL = 'Soriku Routing Overrides';

    @inject(EngineClient)
    protected readonly engineClient: EngineClient;

    @inject(MessageService)
    protected readonly messages: MessageService;

    @inject(QuickInputService)
    protected readonly quickInput: QuickInputService;

    protected state: OverridesState = { status: 'loading', overrides: [], categories: [], models: [] };
    protected busy = false;

    @postConstruct()
    protected init(): void {
        this.id = SorikuRoutingOverridesWidget.ID;
        this.title.label = SorikuRoutingOverridesWidget.LABEL;
        this.title.caption = SorikuRoutingOverridesWidget.LABEL;
        this.title.iconClass = 'codicon codicon-arrow-swap';
        this.title.closable = true;
        this.node.tabIndex = 0;
        this.addClass('soriku-routing-widget');
        this.update();
        this.refresh();
    }

    async refresh(): Promise<void> {
        this.state = { ...this.state, status: 'loading' };
        this.update();
        try {
            const [overrides, models, capabilities] = await Promise.all([
                this.engineClient.listRoutingOverrides(),
                this.engineClient.listModels(),
                this.engineClient.getCapabilities(),
            ]);
            this.state = {
                status: 'ready',
                overrides: parseOverrides(overrides),
                categories: toCapabilityTable(capabilities).categories,
                models: parseModelIds(models),
            };
        } catch (e) {
            this.state = { ...this.state, status: 'error', error: (e as Error).message };
        }
        this.update();
    }

    /** Sets or clears (modelId === '') the override for one category, from its inline picker. */
    protected async setOverride(category: string, modelId: string): Promise<void> {
        if (this.busy) {
            return;
        }
        this.busy = true;
        this.update();
        try {
            if (modelId === '') {
                await this.engineClient.deleteRoutingOverride(category);
            } else {
                await this.engineClient.setRoutingOverride({ category, model_id: modelId });
            }
            await this.refresh();
        } catch (e) {
            this.messages.error(`Could not update routing for "${category}": ${(e as Error).message}`);
        } finally {
            this.busy = false;
            this.update();
        }
    }

    protected render(): React.ReactNode {
        return <div className='sk-page soriku-routing'>
            <PageHeader
                eyebrow='Smart routing'
                heading='Which model,'
                emphasis='which task'
                subhead='Soriku classifies each prompt and routes it to the strongest model. Force a model per category, or leave it on Auto.'
                actions={<Btn variant='secondary' onClick={() => this.refresh()}>
                    <span className='codicon codicon-refresh' />
                </Btn>}
            />
            <div className='sk-page-body sk-page-body-narrow soriku-routing-body'>
                {this.renderBody()}
            </div>
        </div>;
    }

    protected renderBody(): React.ReactNode {
        const { status, categories, overrides, models, error } = this.state;
        if (status === 'loading' && categories.length === 0) {
            return <div className='soriku-routing-message'>Loading routing…</div>;
        }
        if (status === 'error') {
            return <div className='soriku-routing-message soriku-routing-error'>
                <div>Could not load routing overrides.</div>
                <div className='soriku-routing-error-detail'>{error}</div>
                <Btn variant='secondary' onClick={() => this.refresh()}>Retry</Btn>
            </div>;
        }
        if (categories.length === 0) {
            return <div className='soriku-routing-message'>No categories yet. Run benchmarks in Soriku, then refresh.</div>;
        }
        const rows = mergeCategoryRows(categories, overrides);
        return <>
            <div className='soriku-routing-table'>
                <div className='soriku-routing-table-head'>
                    <span>Category</span><span>Model override</span>
                </div>
                {rows.map(row => this.renderRow(row, models))}
            </div>
            <div className='soriku-routing-hint'>
                <span className='codicon codicon-info' />
                Click a value to change it. <b>Auto</b> follows the capability map; a forced model always wins for that category.
            </div>
        </>;
    }

    /**
     * Mockup cycles through a small, fixed per-category option list on click
     * (opts[idx % opts.length]). Real installed-model lists can be much
     * longer, where blind cycling would take many clicks to reach a specific
     * model — so this opens a quick-pick instead (same one-click-to-change
     * goal, scales to any real model count). No per-category description is
     * shown (mockup's r.desc is invented prose with no engine data source).
     */
    protected async pickOverride(category: string, models: string[]): Promise<void> {
        if (this.busy) {
            return;
        }
        const items: QuickPickItem[] = [
            { label: 'Auto', description: 'Follow the capability map' },
            ...models.map(m => ({ label: m })),
        ];
        const pick = await this.quickInput.showQuickPick(items, { placeholder: `Model override for ${category}` });
        if (pick) {
            await this.setOverride(category, pick.label === 'Auto' ? '' : pick.label);
        }
    }

    protected renderRow(row: RoutingCategoryRow, models: string[]): React.ReactNode {
        const forced = !!row.override;
        const dotColor = categoryColors(toKnownCategory(row.category)).c;
        return <div key={row.category} className='soriku-routing-row'>
            <div className='soriku-routing-row-cat'>
                <span className='soriku-routing-row-dot' style={{ background: dotColor }} />
                <span className='soriku-routing-row-name'>{row.category}</span>
            </div>
            <button
                className={`soriku-routing-pick${forced ? ' forced' : ''}`}
                disabled={this.busy}
                onClick={() => this.pickOverride(row.category, models)}
            >
                <span className={`codicon ${forced ? 'codicon-pinned' : 'codicon-zap'}`} />
                <span className='soriku-routing-pick-label'>{row.override ?? 'Auto'}</span>
                <span className='codicon codicon-chevron-down' />
            </button>
        </div>;
    }
}
