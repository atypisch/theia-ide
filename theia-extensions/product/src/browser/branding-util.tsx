/********************************************************************************
 * Copyright (C) 2020 EclipseSource and others.
 *
 * This program and the accompanying materials are made available under the
 * terms of the MIT License, which is available in the project root.
 *
 * SPDX-License-Identifier: MIT
 ********************************************************************************/

import { WindowService } from '@theia/core/lib/browser/window/window-service';
import * as React from 'react';

export interface ExternalBrowserLinkProps {
    text: string;
    url: string;
    windowService: WindowService;
}

function BrowserLink(props: ExternalBrowserLinkProps): JSX.Element {
    return <a
        role={'button'}
        tabIndex={0}
        href={props.url}
        target='_blank'
    >
        {props.text}
    </a>;
}

export function renderExtendingCustomizing(windowService: WindowService): React.ReactNode {
    return <div className='gs-section'>
        <h3 className='gs-section-header'>
            Extending Soriku Code
        </h3>
        <div >
            Install VS Code extensions from the <BrowserLink text="OpenVSX registry" url="https://open-vsx.org/"
                windowService={windowService} ></BrowserLink> to extend the editor. Soriku-specific features (agents, chat, tools) ship as dedicated Soriku extensions.
        </div>
    </div>;
}

export function renderCollaboration(windowService: WindowService): React.ReactNode {
    return <div className='gs-section'>
        <h3 className='gs-section-header'>
            Collaboration
        </h3>
        <div >
            The IDE features a built-in collaboration feature.
            You can share your workspace with others and work together in real-time by clicking on the <i>Collaborate</i> item in the status bar.
            The collaboration feature is powered by
            the <BrowserLink text="Open Collaboration Tools" url="https://www.open-collab.tools/" windowService={windowService} /> project
            and uses their public server infrastructure.
        </div>
    </div>;
}

