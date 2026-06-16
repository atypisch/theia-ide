/********************************************************************************
 * Soriku IDE — agent edit widget (persona refinement)
 *
 * SPDX-License-Identifier: MIT
 ********************************************************************************/

import * as React from '@theia/core/shared/react';
import { inject, injectable, postConstruct } from '@theia/core/shared/inversify';
import { ReactWidget } from '@theia/core/lib/browser/widgets/react-widget';
import { MessageService } from '@theia/core/lib/common';
import { EngineClient } from 'soriku-engine-client-ext/lib/common/engine-client';
import { AgentForm, buildUpdateRequest, toAgentForm } from '../common/agent-form';

interface EditState {
    status: 'empty' | 'loading' | 'error' | 'ready' | 'saving';
    agentId?: string;
    form?: AgentForm;
    error?: string;
}

@injectable()
export class SorikuAgentEditWidget extends ReactWidget {

    static readonly ID = 'soriku-agent-edit';
    static readonly LABEL = 'Edit Agent';

    @inject(EngineClient)
    protected readonly engineClient: EngineClient;

    @inject(MessageService)
    protected readonly messages: MessageService;

    protected state: EditState = { status: 'empty' };

    protected nameRef = React.createRef<HTMLInputElement>();
    protected roleRef = React.createRef<HTMLInputElement>();
    protected descriptionRef = React.createRef<HTMLInputElement>();
    protected modelRef = React.createRef<HTMLInputElement>();
    protected visibilityRef = React.createRef<HTMLInputElement>();
    protected promptRef = React.createRef<HTMLTextAreaElement>();

    @postConstruct()
    protected init(): void {
        this.id = SorikuAgentEditWidget.ID;
        this.title.label = SorikuAgentEditWidget.LABEL;
        this.title.caption = SorikuAgentEditWidget.LABEL;
        this.title.iconClass = 'codicon codicon-settings-gear';
        this.title.closable = true;
        this.node.tabIndex = 0;
        this.addClass('soriku-agent-edit-widget');
        this.update();
    }

    async loadAgent(agentId: string): Promise<void> {
        this.state = { status: 'loading', agentId };
        this.update();
        try {
            const response = await this.engineClient.getAgent(agentId);
            this.state = { status: 'ready', agentId, form: toAgentForm(response.data) };
            this.title.label = `Edit: ${response.data.name || agentId}`;
        } catch (e) {
            this.state = { status: 'error', agentId, error: (e as Error).message };
        }
        this.update();
    }

    protected collectForm(): AgentForm {
        return {
            name: this.nameRef.current?.value ?? '',
            role: this.roleRef.current?.value ?? '',
            description: this.descriptionRef.current?.value ?? '',
            preferredModel: this.modelRef.current?.value ?? '',
            visibility: this.visibilityRef.current?.value ?? '',
            systemPrompt: this.promptRef.current?.value ?? '',
        };
    }

    protected async save(): Promise<void> {
        const agentId = this.state.agentId;
        if (!agentId || this.state.status === 'saving') {
            return;
        }
        const form = this.collectForm();
        this.state = { ...this.state, status: 'saving' };
        this.update();
        try {
            const response = await this.engineClient.updateAgent(agentId, buildUpdateRequest(form));
            this.state = { status: 'ready', agentId, form: toAgentForm(response.data) };
            this.messages.info('Agent saved. Open a new chat to see the changes.');
        } catch (e) {
            this.state = { status: 'ready', agentId, form };
            this.messages.error(`Could not save agent: ${(e as Error).message}`);
        }
        this.update();
    }

    protected render(): React.ReactNode {
        const { status, form, error } = this.state;
        if (status === 'empty') {
            return <div className='soriku-agent-edit-message'>Select an agent and choose “Edit” to customize it.</div>;
        }
        if (status === 'loading') {
            return <div className='soriku-agent-edit-message'>Loading agent…</div>;
        }
        if (status === 'error' || !form) {
            return <div className='soriku-agent-edit-message soriku-agent-edit-error'>Could not load agent: {error}</div>;
        }
        const saving = status === 'saving';
        return <div className='soriku-agent-edit'>
            <div className='soriku-agent-edit-grid'>
                {this.field('Name', this.nameRef, form.name)}
                {this.field('Role', this.roleRef, form.role)}
                {this.field('Description', this.descriptionRef, form.description)}
                {this.field('Preferred model (blank = auto)', this.modelRef, form.preferredModel)}
                {this.field('Visibility', this.visibilityRef, form.visibility)}
            </div>
            <label className='soriku-agent-edit-label'>System prompt</label>
            <textarea
                ref={this.promptRef}
                className='theia-input soriku-agent-edit-prompt'
                rows={12}
                defaultValue={form.systemPrompt}
            />
            <div className='soriku-agent-edit-note'>
                Per-agent tool whitelist and routing mode are not yet persisted by the engine.
                Set those per chat for now.
            </div>
            <div className='soriku-agent-edit-actions'>
                <button className='theia-button' disabled={saving} onClick={() => this.save()}>
                    {saving ? 'Saving…' : 'Save'}
                </button>
            </div>
        </div>;
    }

    protected field(label: string, ref: React.RefObject<HTMLInputElement>, value: string): React.ReactNode {
        return <div className='soriku-agent-edit-row'>
            <label className='soriku-agent-edit-label'>{label}</label>
            <input ref={ref} className='theia-input' type='text' defaultValue={value} />
        </div>;
    }
}
