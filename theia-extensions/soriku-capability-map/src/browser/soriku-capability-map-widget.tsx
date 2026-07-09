/********************************************************************************
 * Soriku IDE — capability map widget (read-only, sortable table)
 *
 * SPDX-License-Identifier: MIT
 ********************************************************************************/

import * as React from '@theia/core/shared/react';
import { inject, injectable, postConstruct } from '@theia/core/shared/inversify';
import { ReactWidget } from '@theia/core/lib/browser/widgets/react-widget';
import { EngineClient } from 'soriku-engine-client-ext/lib/common/engine-client';
import { Btn, PageHeader, categoryColors, toKnownCategory } from 'soriku-theme-ext/lib/browser/ui';
import {
    bestCategory,
    CapabilitySortKey,
    CapabilityTable,
    columnMaxima,
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
    protected sortBy: CapabilitySortKey = 'model';
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
        return <div className='sk-page soriku-capmap'>
            <PageHeader
                eyebrow='Capability map'
                heading='What each model is'
                emphasis='good at'
                subhead='The router scores every task against this grid before it picks a model. Best-in-category is outlined.'
                actions={<Btn variant='secondary' onClick={() => this.refresh()}>
                    <span className='codicon codicon-refresh' /> Refresh
                </Btn>}
            />
            <div className='sk-page-body soriku-capmap-body-wrap'>
                {this.renderBody()}
            </div>
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
                <Btn variant='secondary' onClick={() => this.refresh()}>Retry</Btn>
            </div>;
        }
        if (!table || table.empty) {
            return <div className='soriku-capmap-message'>No capability data yet. Run benchmarks in Soriku, then refresh.</div>;
        }
        const rows = sortRows(table.rows, this.sortBy, this.descending);
        const colMax = columnMaxima(table);
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
                        {table.categories.map(cat => this.renderHeader(cat, cat))}
                    </tr>
                </thead>
                <tbody>
                    {rows.map(row => {
                        const best = bestCategory(row);
                        const dotColor = best ? categoryColors(toKnownCategory(best)).c : undefined;
                        return <tr key={row.model}>
                            <td className='soriku-capmap-model'>
                                {dotColor && <span className='soriku-capmap-model-dot' style={{ background: dotColor }} />}
                                {row.model}{row.stale && <span className='soriku-capmap-stale'> stale</span>}
                            </td>
                            {table.categories.map(cat => this.renderCell(row.scores[cat], row.scores[cat] === colMax[cat]))}
                        </tr>;
                    })}
                </tbody>
            </table>
            <div className='soriku-capmap-legend'>
                <span>Score 0–100</span>
                <span className='soriku-capmap-legend-gradient'>
                    <span className='soriku-capmap-legend-gradient-bar' />low → high
                </span>
                <span className='soriku-capmap-legend-best'>
                    <span className='soriku-capmap-legend-best-swatch' />best in category
                </span>
            </div>
        </div>;
    }

    /**
     * 1:1 the mockup's heatmap cell formula: background = accent at score*0.9%
     * opacity, best-in-column gets a bold weight + inset outline.
     */
    protected renderCell(score: number | undefined, best: boolean): React.ReactNode {
        if (score === undefined) {
            return <td className='soriku-capmap-cell soriku-capmap-cell-empty'>—</td>;
        }
        return <td
            className={`soriku-capmap-cell${best ? ' best' : ''}`}
            style={{
                background: `color-mix(in srgb, var(--acc) ${Math.round(score * 0.9)}%, transparent)`,
                color: score > 62 ? 'var(--on-acc)' : 'var(--ink2)',
                fontWeight: best ? 700 : 500,
            }}
        >{score}</td>;
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
