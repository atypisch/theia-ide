/********************************************************************************
 * Soriku IDE — capability map widget (read-only, sortable table)
 *
 * SPDX-License-Identifier: MIT
 ********************************************************************************/

import * as React from '@theia/core/shared/react';
import { inject, injectable, postConstruct } from '@theia/core/shared/inversify';
import { ReactWidget } from '@theia/core/lib/browser/widgets/react-widget';
import { EngineClient } from 'soriku-engine-client-ext/lib/common/engine-client';
import {
    CapabilitySortKey,
    CapabilityTable,
    sortRows,
    toCapabilityTable,
} from '../common/capability-table';

interface MapState {
    status: 'loading' | 'error' | 'ready';
    table?: CapabilityTable;
    error?: string;
}

@injectable()
export class SorikuCapabilityMapWidget extends ReactWidget {

    static readonly ID = 'soriku-capability-map';
    static readonly LABEL = 'Soriku Capability Map';

    @inject(EngineClient)
    protected readonly engineClient: EngineClient;

    protected state: MapState = { status: 'loading' };
    protected sortBy: CapabilitySortKey = 'aggregate';
    protected descending = true;

    @postConstruct()
    protected init(): void {
        this.id = SorikuCapabilityMapWidget.ID;
        this.title.label = SorikuCapabilityMapWidget.LABEL;
        this.title.caption = SorikuCapabilityMapWidget.LABEL;
        this.title.iconClass = 'codicon codicon-graph';
        this.title.closable = true;
        this.node.tabIndex = 0;
        this.addClass('soriku-capmap-widget');
        this.update();
        this.refresh();
    }

    async refresh(): Promise<void> {
        this.state = { status: 'loading', table: this.state.table };
        this.update();
        try {
            const response = await this.engineClient.getCapabilities();
            this.state = { status: 'ready', table: toCapabilityTable(response) };
        } catch (e) {
            this.state = { status: 'error', error: (e as Error).message };
        }
        this.update();
    }

    protected setSort(key: CapabilitySortKey): void {
        if (this.sortBy === key) {
            this.descending = !this.descending;
        } else {
            this.sortBy = key;
            this.descending = true;
        }
        this.update();
    }

    protected render(): React.ReactNode {
        return <div className='soriku-capmap'>
            <div className='soriku-capmap-header'>
                <span className='soriku-capmap-title'>Capability Map</span>
                <button className='theia-button secondary' onClick={() => this.refresh()}>
                    <span className='codicon codicon-refresh' /> Refresh
                </button>
            </div>
            {this.renderBody()}
        </div>;
    }

    protected renderBody(): React.ReactNode {
        const { status, table, error } = this.state;
        if (status === 'loading' && !table) {
            return <div className='soriku-capmap-message'>Loading capability map…</div>;
        }
        if (status === 'error') {
            return <div className='soriku-capmap-message soriku-capmap-error'>
                <div>Could not load the capability map.</div>
                <div className='soriku-capmap-error-detail'>{error}</div>
                <button className='theia-button' onClick={() => this.refresh()}>Retry</button>
            </div>;
        }
        if (!table || table.empty) {
            return <div className='soriku-capmap-message'>No capability data yet. Run benchmarks in Soriku, then refresh.</div>;
        }
        const rows = sortRows(table.rows, this.sortBy, this.descending);
        return <div className='soriku-capmap-body'>
            {table.meta && <div className='soriku-capmap-meta'>
                {table.meta.source && <span>Source: {table.meta.source}</span>}
                {table.meta.updatedAt && <span>Updated: {table.meta.updatedAt}</span>}
                {table.meta.stale && <span className='soriku-capmap-stale'>stale</span>}
            </div>}
            <table className='soriku-capmap-table'>
                <thead>
                    <tr>
                        {this.renderHeader('Model', 'model')}
                        {this.renderHeader('Aggregate', 'aggregate')}
                        {table.categories.map(cat => this.renderHeader(cat, cat))}
                    </tr>
                </thead>
                <tbody>
                    {rows.map(row => <tr key={row.model}>
                        <td className='soriku-capmap-model'>
                            {row.model}{row.stale && <span className='soriku-capmap-stale'> stale</span>}
                        </td>
                        <td>{row.aggregate ?? '—'}</td>
                        {table.categories.map(cat => <td key={cat}>{row.scores[cat] ?? '—'}</td>)}
                    </tr>)}
                </tbody>
            </table>
        </div>;
    }

    protected renderHeader(label: string, key: CapabilitySortKey): React.ReactNode {
        const active = this.sortBy === key;
        const arrow = active ? (this.descending ? ' ▼' : ' ▲') : '';
        return <th
            key={key}
            className={`soriku-capmap-th${active ? ' active' : ''}`}
            onClick={() => this.setSort(key)}
            title='Click to sort'
        >{label}{arrow}</th>;
    }
}
