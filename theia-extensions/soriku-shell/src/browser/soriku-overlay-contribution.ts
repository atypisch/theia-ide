/********************************************************************************
 * Soriku IDE — mounts the global overlay host and registers the commands that
 * open it (Keyboard shortcuts, New window) plus the Documentation link.
 *
 * SPDX-License-Identifier: MIT
 ********************************************************************************/

import * as React from '@theia/core/shared/react';
import { createRoot, Root } from '@theia/core/shared/react-dom/client';
import { inject, injectable } from '@theia/core/shared/inversify';
import { Command, CommandContribution, CommandRegistry } from '@theia/core/lib/common';
import { FrontendApplicationContribution } from '@theia/core/lib/browser/frontend-application-contribution';
import { KeybindingRegistry } from '@theia/core/lib/browser/keybinding';
import { WindowService } from '@theia/core/lib/browser/window/window-service';
import { SorikuOverlayService } from './soriku-overlay-service';
import { SorikuOverlayHost } from './soriku-overlay-host';

const SORIKU_DOCS_URL = 'https://soriku.com/docs';

export namespace SorikuOverlayCommands {
    const CATEGORY = 'Soriku';
    export const SHORTCUTS: Command = { id: 'soriku.overlay.shortcuts', category: CATEGORY, label: 'Keyboard Shortcuts' };
    export const NEW_WINDOW: Command = { id: 'soriku.overlay.newWindow', category: CATEGORY, label: 'New Window…' };
    export const OPEN_DOCS: Command = { id: 'soriku.docs.open', category: CATEGORY, label: 'Documentation' };
}

@injectable()
export class SorikuOverlayContribution implements FrontendApplicationContribution, CommandContribution {

    @inject(SorikuOverlayService)
    protected readonly overlayService: SorikuOverlayService;

    @inject(CommandRegistry)
    protected readonly commands: CommandRegistry;

    @inject(KeybindingRegistry)
    protected readonly keybindings: KeybindingRegistry;

    @inject(WindowService)
    protected readonly windowService: WindowService;

    protected root: Root | undefined;

    onStart(): void {
        const host = document.createElement('div');
        host.className = 'soriku-overlay-host';
        document.body.appendChild(host);
        this.root = createRoot(host);
        this.render();
        this.overlayService.onDidChange(() => this.render());
        document.addEventListener('keydown', this.onKeyDown, true);
    }

    protected onKeyDown = (e: KeyboardEvent): void => {
        if (e.key === 'Escape' && this.overlayService.getKind() !== undefined) {
            this.overlayService.close();
        }
    };

    protected render(): void {
        this.root?.render(React.createElement(SorikuOverlayHost, {
            kind: this.overlayService.getKind(),
            onClose: () => this.overlayService.close(),
            keybindingFor: (commandId: string) => this.keybindingFor(commandId),
            onOpenAllShortcuts: () => {
                this.overlayService.close();
                this.commands.executeCommand('keybindings:open');
            },
            onConfirmNewWindow: () => {
                this.overlayService.close();
                this.commands.executeCommand('workbench.action.newWindow');
            },
        }));
    }

    protected keybindingFor(commandId: string): string | undefined {
        const kb = this.keybindings.getKeybindingsForCommand(commandId)[0];
        if (!kb) {
            return undefined;
        }
        return this.keybindings.acceleratorFor(kb).join(' ');
    }

    registerCommands(commands: CommandRegistry): void {
        commands.registerCommand(SorikuOverlayCommands.SHORTCUTS, {
            execute: () => this.overlayService.open('shortcuts'),
        });
        commands.registerCommand(SorikuOverlayCommands.NEW_WINDOW, {
            execute: () => this.overlayService.open('new-window'),
        });
        commands.registerCommand(SorikuOverlayCommands.OPEN_DOCS, {
            execute: () => this.windowService.openNewWindow(SORIKU_DOCS_URL),
        });
    }
}
