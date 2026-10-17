/********************************************************************************
 * Soriku IDE — soriku.md lifecycle: create the default on open, keep state fresh,
 * and the commands behind the status-bar item and the chat's review banner.
 *
 * SPDX-License-Identifier: MIT
 ********************************************************************************/

import { inject, injectable } from '@theia/core/shared/inversify';
import { Command, CommandContribution, CommandRegistry, MessageService } from '@theia/core/lib/common';
import { FrontendApplicationContribution } from '@theia/core/lib/browser/frontend-application-contribution';
import { OpenerService, open } from '@theia/core/lib/browser/opener-service';
import { FileService } from '@theia/filesystem/lib/browser/file-service';
import { WorkspaceService } from '@theia/workspace/lib/browser/workspace-service';
import { SorikuProjectInstructionsService } from './soriku-project-instructions-service';

export namespace SorikuInstructionsCommands {
    export const OPEN: Command = { id: 'soriku.instructions.open', category: 'Soriku', label: 'Open Project Instructions (soriku.md)' };
    export const APPROVE: Command = { id: 'soriku.instructions.approve', category: 'Soriku', label: 'Approve Project Instructions' };
}

@injectable()
export class SorikuProjectInstructionsContribution implements FrontendApplicationContribution, CommandContribution {

    @inject(SorikuProjectInstructionsService)
    protected readonly instructions: SorikuProjectInstructionsService;

    @inject(WorkspaceService)
    protected readonly workspaceService: WorkspaceService;

    @inject(FileService)
    protected readonly fileService: FileService;

    @inject(OpenerService)
    protected readonly openers: OpenerService;

    @inject(MessageService)
    protected readonly messages: MessageService;

    onStart(): void {
        this.workspaceService.ready.then(() => this.prepare()).catch(() => undefined);
        this.workspaceService.onWorkspaceChanged(() => { this.prepare().catch(() => undefined); });
        // A pull or an edit may change the files; re-evaluate (cheap) so the status stays true.
        this.fileService.onDidFilesChange(() => { this.instructions.refresh().catch(() => undefined); });
    }

    protected async prepare(): Promise<void> {
        const created = await this.instructions.ensureDefault();
        if (created) {
            const choice = await this.messages.info('soriku.md created — default instructions for Soriku agents in this project.', 'Open');
            if (choice === 'Open') {
                await open(this.openers, created);
            }
        } else {
            await this.instructions.refresh();
        }
    }

    registerCommands(commands: CommandRegistry): void {
        commands.registerCommand(SorikuInstructionsCommands.OPEN, {
            execute: async () => {
                const file = await this.instructions.primaryFile();
                if (file) { await open(this.openers, file); }
            },
        });
        commands.registerCommand(SorikuInstructionsCommands.APPROVE, {
            execute: () => this.instructions.approve(),
        });
    }
}
