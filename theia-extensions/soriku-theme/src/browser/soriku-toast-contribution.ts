/********************************************************************************
 * Soriku IDE — mounts the global Toast host at the document root.
 *
 * SPDX-License-Identifier: MIT
 ********************************************************************************/

import * as React from '@theia/core/shared/react';
import { createRoot, Root } from '@theia/core/shared/react-dom/client';
import { inject, injectable } from '@theia/core/shared/inversify';
import { FrontendApplicationContribution } from '@theia/core/lib/browser/frontend-application-contribution';
import { Toast } from './ui/Toast';
import { SorikuToastService } from './soriku-toast-service';

@injectable()
export class SorikuToastContribution implements FrontendApplicationContribution {

    @inject(SorikuToastService)
    protected readonly toastService: SorikuToastService;

    protected root: Root | undefined;

    onStart(): void {
        const host = document.createElement('div');
        host.className = 'soriku-toast-host';
        document.body.appendChild(host);
        this.root = createRoot(host);
        this.render();
        this.toastService.onDidChange(() => this.render());
    }

    protected render(): void {
        this.root?.render(React.createElement(Toast, {
            message: this.toastService.getMessage(),
            onDismiss: () => this.toastService.dismiss(),
        }));
    }
}
