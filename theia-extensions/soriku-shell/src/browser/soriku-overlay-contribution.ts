/********************************************************************************
 * Soriku IDE — mounts the global overlay host and registers the commands that
 * open it (Keyboard shortcuts, New window, New file, Documentation).
 *
 * SPDX-License-Identifier: MIT
 ********************************************************************************/

import * as React from '@theia/core/shared/react';
import { createRoot, Root } from '@theia/core/shared/react-dom/client';
import { inject, injectable } from '@theia/core/shared/inversify';
import { Command, CommandContribution, CommandRegistry } from '@theia/core/lib/common';
import { FrontendApplicationContribution } from '@theia/core/lib/browser/frontend-application-contribution';
import { KeybindingRegistry } from '@theia/core/lib/browser/keybinding';
import { open, OpenerService } from '@theia/core/lib/browser/opener-service';
import { FileService } from '@theia/filesystem/lib/browser/file-service';
import { WorkspaceService } from '@theia/workspace/lib/browser/workspace-service';
import { SorikuOverlayService } from './soriku-overlay-service';
import { SorikuOverlayHost } from './soriku-overlay-host';

export namespace SorikuOverlayCommands {
    const CATEGORY = 'Soriku';
    export const SHORTCUTS: Command = { id: 'soriku.overlay.shortcuts', category: CATEGORY, label: 'Keyboard Shortcuts' };
    export const NEW_WINDOW: Command = { id: 'soriku.overlay.newWindow', category: CATEGORY, label: 'New Window…' };
    export const NEW_FILE: Command = { id: 'soriku.overlay.newFile', category: CATEGORY, label: 'New File…' };
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

    @inject(FileService)
    protected readonly fileService: FileService;

    @inject(WorkspaceService)
    protected readonly workspaceService: WorkspaceService;

    @inject(OpenerService)
    protected readonly openerService: OpenerService;

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
            onCreateFile: (relativePath: string) => this.createFile(relativePath),
        }));
    }

    protected async createFile(relativePath: string): Promise<string | undefined> {
        const root = this.workspaceService.tryGetRoots()[0]?.resource;
        if (!root) {
            return 'No workspace is open.';
        }
        const uri = root.resolve(relativePath);
        if (await this.fileService.exists(uri)) {
            return 'A file already exists at this path.';
        }
        try {
            await this.fileService.create(uri);
        } catch (e) {
            return (e as Error).message;
        }
        this.overlayService.close();
        await open(this.openerService, uri);
        return undefined;
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
        commands.registerCommand(SorikuOverlayCommands.NEW_FILE, {
            execute: () => this.overlayService.open('new-file'),
        });
        commands.registerCommand(SorikuOverlayCommands.OPEN_DOCS, {
            execute: () => this.overlayService.open('docs'),
        });
    }
}
