/********************************************************************************
 * Copyright (C) 2020 EclipseSource and others.
 *
 * This program and the accompanying materials are made available under the
 * terms of the MIT License, which is available in the project root.
 *
 * SPDX-License-Identifier: MIT
 ********************************************************************************/

import * as React from 'react';

import { Message } from '@theia/core/lib/browser';
import { CommandService, PreferenceService } from '@theia/core/lib/common';
import { inject, injectable } from '@theia/core/shared/inversify';
import { renderCollaboration } from './branding-util';
import { Btn, Card, PageHeader } from 'soriku-theme-ext/lib/browser/ui';

import { GettingStartedWidget } from '@theia/getting-started/lib/browser/getting-started-widget';
import { VSXEnvironment } from '@theia/vsx-registry/lib/common/vsx-environment';
import { WindowService } from '@theia/core/lib/browser/window/window-service';

@injectable()
export class TheiaIDEGettingStartedWidget extends GettingStartedWidget {

    @inject(VSXEnvironment)
    protected readonly environment: VSXEnvironment;

    @inject(WindowService)
    protected readonly windowService: WindowService;

    @inject(PreferenceService)
    protected readonly preferenceService: PreferenceService;

    @inject(CommandService)
    protected readonly commandService: CommandService;

    protected vscodeApiVersion: string;

    protected async doInit(): Promise<void> {
        super.doInit();
        this.vscodeApiVersion = await this.environment.getVscodeApiVersion();
        await this.preferenceService.ready;
        this.update();
    }

    protected onActivateRequest(msg: Message): void {
        super.onActivateRequest(msg);
        const htmlElement = document.getElementById('alwaysShowWelcomePage');
        if (htmlElement) {
            htmlElement.focus();
        }
    }

    /**
     * 1:1 with the mockup's full-page-view header pattern (PageHeader), since the
     * mockup itself has no dedicated "empty workspace" screen to match verbatim —
     * composed from the same components Settings/Agents already use.
     */
    protected render(): React.ReactNode {
        return <div className='sk-page soriku-welcome'>
            <PageHeader
                eyebrow='Soriku Code'
                heading='Welcome to'
                emphasis='Soriku Code'
                subhead={this.renderVersion()}
            />
            <div className='sk-page-body sk-page-body-narrow soriku-welcome-body'>
                <Card className='soriku-welcome-intro'>
                    <div className='soriku-welcome-intro-heading'>Agent-first AI coding</div>
                    <div className='soriku-welcome-intro-body'>
                        Soriku Code connects to the Soriku engine for agents, chat and tool execution —
                        locally or hosted. Work with agents, not raw models; every answer shows which
                        model replied.
                    </div>
                    <div className='soriku-welcome-actions'>
                        <Btn variant='primary' onClick={() => this.commandService.executeCommand('soriku.agents.toggle')}>
                            View Agents
                        </Btn>
                        <Btn variant='secondary' onClick={() => this.commandService.executeCommand('soriku.auth.connect')}>
                            Connect to Simezu (optional)
                        </Btn>
                    </div>
                </Card>
                <Card className='soriku-welcome-col'>
                    {this.renderStart()}
                    {this.renderRecentWorkspaces()}
                </Card>
                <Card className='soriku-welcome-col'>
                    {this.renderSettings()}
                    {this.renderHelp()}
                </Card>
                <Card className='soriku-welcome-intro'>
                    {renderCollaboration(this.windowService)}
                </Card>
                <div className='soriku-welcome-footer'>Local-first AI coding. EU-hosted. No telemetry.</div>
            </div>
            <div className='gs-preference-container'>
                {this.renderPreferences()}
            </div>
        </div>;
    }

    protected renderVersion(): string {
        const version = this.applicationInfo ? `v${this.applicationInfo.version}` : '';
        return [version, `VS Code API ${this.vscodeApiVersion}`].filter(Boolean).join(' · ');
    }
}
