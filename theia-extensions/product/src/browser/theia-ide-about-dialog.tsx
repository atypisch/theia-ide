/********************************************************************************
 * Copyright (C) 2020 EclipseSource and others.
 *
 * This program and the accompanying materials are made available under the
 * terms of the MIT License, which is available in the project root.
 *
 * SPDX-License-Identifier: MIT
 ********************************************************************************/

import * as React from 'react';
import { AboutDialog, AboutDialogProps, ABOUT_CONTENT_CLASS } from '@theia/core/lib/browser/about-dialog';
import { injectable, inject } from '@theia/core/shared/inversify';
import { CommandRegistry } from '@theia/core/lib/common/command';
import { PreferenceService } from '@theia/core/lib/common/preferences/preference-service';
import { SorikuMark } from 'soriku-theme-ext/lib/browser/ui';
import { SORIKU_ENGINE_BASE_URL } from 'soriku-engine-client-ext/lib/browser/soriku-engine-preferences';
import { shortHost } from 'soriku-workbench-ext/lib/common/engine-status';

@injectable()
export class TheiaIDEAboutDialog extends AboutDialog {

    @inject(PreferenceService)
    protected readonly preferences: PreferenceService;

    @inject(CommandRegistry)
    protected readonly commands: CommandRegistry;

    constructor(
        @inject(AboutDialogProps) protected readonly props: AboutDialogProps
    ) {
        super(props);
    }

    protected render(): React.ReactNode {
        return <div className={ABOUT_CONTENT_CLASS}>
            {this.renderContent()}
        </div>;
    }

    /** 1:1 from the mockup's ABOUT overlay: mark, wordmark, version/engine line, tagline, Close. */
    protected renderContent(): React.ReactNode {
        const baseUrl = this.preferences.get<string>(SORIKU_ENGINE_BASE_URL, 'http://127.0.0.1:8765');
        const version = this.applicationInfo?.version;
        // The updater only binds in the Electron target — a "channel" concept
        // doesn't exist at all in the browser dev-harness build.
        const hasUpdater = !!this.commands.getCommand('electron-theia:check-for-updates');
        const channel = hasUpdater ? this.preferences.get<string>('updates.channel', 'stable') : undefined;
        return <div className='soriku-about'>
            <SorikuMark size={48} />
            <div className='soriku-about-wordmark'>Soriku <span className='sk-em'>IDE</span></div>
            <div className='soriku-about-meta'>
                {['IDE', version && `v${version}`, `engine ${shortHost(baseUrl)}`, channel && `${channel} channel`].filter(Boolean).join(' · ')}
            </div>
            <div className='soriku-about-tagline'>
                A local-first AI IDE. Your code and models stay on your machine. Cloud is opt-in and capped in EUR.
            </div>
        </div>;
    }
}
