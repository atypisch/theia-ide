/********************************************************************************
 * Soriku IDE — routing overrides widget (user-level)
 *
 * SPDX-License-Identifier: MIT
 ********************************************************************************/

import * as React from '@theia/core/shared/react';
import { inject, injectable, postConstruct } from '@theia/core/shared/inversify';
import { ReactWidget } from '@theia/core/lib/browser/widgets/react-widget';
import { MessageService } from '@theia/core/lib/common';
import { EngineClient } from 'soriku-engine-client-ext/lib/common/engine-client';
import {
    OverrideRow,
    parseModelIds,
    parseOverrides,
    validateNewOverride,
} from '../common/routing-overrides';

interface OverridesState {
    status: 'loading' | 'error' | 'ready';
    overrides: OverrideRow[];
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

    protected state: OverridesState = { status: 'loading', overrides: [], models: [] };
    protected categoryRef = React.createRef<HTMLInputElement>();
    protected modelRef = React.createRef<HTMLSelectElement>();
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
            const [overrides, models] = await Promise.all([
                this.engineClient.listRoutingOverrides(),
                this.engineClient.listModels(),
            ]);
            this.state = {
                status: 'ready',
                overrides: parseOverrides(overrides),
                models: parseModelIds(models),
            };
        } catch (e) {
            this.state = { ...this.state, status: 'error', error: (e as Error).message };
        }
        this.update();
    }

    protected async add(): Promise<void> {
        if (this.busy) {
            return;
        }
        const category = this.categoryRef.current?.value ?? '';
        const modelId = this.modelRef.current?.value ?? '';
        const validation = validateNewOverride(category, modelId);
        if (!validation.ok) {
            this.messages.warn(validation.error ?? 'Invalid override.');
            return;
        }
        this.busy = true;
        this.update();
        try {
            await this.engineClient.setRoutingOverride({ category: category.trim(), model_id: modelId.trim() });
            if (this.categoryRef.current) {
                this.categoryRef.current.value = '';
            }
            await this.refresh();
        } catch (e) {
            this.messages.error(`Could not set override: ${(e as Error).message}`);
        } finally {
            this.busy = false;
            this.update();
        }
    }

    protected async remove(category: string): Promise<void> {
        if (this.busy) {
            return;
        }
        this.busy = true;
        this.update();
        try {
            await this.engineClient.deleteRoutingOverride(category);
            await this.refresh();
        } catch (e) {
            this.messages.error(`Could not remove override: ${(e as Error).message}`);
        } finally {
            this.busy = false;
            this.update();
        }
    }

    protected render(): React.ReactNode {
        return <div className='soriku-routing'>
            <div className='soriku-routing-header'>
                <span className='soriku-routing-title'>Routing Overrides (user)</span>
                <button className='theia-button secondary' onClick={() => this.refresh()}>
                    <span className='codicon codicon-refresh' /> Refresh
                </button>
            </div>
            <div className='soriku-routing-note'>
                Force a model for a category. Platform/tenant overrides take precedence and are read-only here.
            </div>
            {this.renderAddForm()}
            {this.renderBody()}
        </div>;
    }

    protected renderAddForm(): React.ReactNode {
        return <div className='soriku-routing-add'>
            <input
                ref={this.categoryRef}
                className='theia-input'
                type='text'
                placeholder='category (e.g. code_generation)'
            />
            <select ref={this.modelRef} className='theia-select'>
                {this.state.models.map(m => <option key={m} value={m}>{m}</option>)}
            </select>
            <button className='theia-button' disabled={this.busy} onClick={() => this.add()}>Add</button>
        </div>;
    }

    protected renderBody(): React.ReactNode {
        const { status, overrides, error } = this.state;
        if (status === 'loading' && overrides.length === 0) {
            return <div className='soriku-routing-message'>Loading overrides…</div>;
        }
        if (status === 'error') {
            return <div className='soriku-routing-message soriku-routing-error'>
                <div>Could not load overrides.</div>
                <div className='soriku-routing-error-detail'>{error}</div>
                <button className='theia-button' onClick={() => this.refresh()}>Retry</button>
            </div>;
        }
        if (overrides.length === 0) {
            return <div className='soriku-routing-message'>No user overrides. Add one above.</div>;
        }
        return <table className='soriku-routing-table'>
            <thead><tr><th>Category</th><th>Model</th><th /></tr></thead>
            <tbody>
                {overrides.map(row => <tr key={row.category}>
                    <td>{row.category}</td>
                    <td>{row.modelId}</td>
                    <td>
                        <button
                            className='theia-button secondary'
                            disabled={this.busy}
                            onClick={() => this.remove(row.category)}
                        >Remove</button>
                    </td>
                </tr>)}
            </tbody>
        </table>;
    }
}
