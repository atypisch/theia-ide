/********************************************************************************
 * Soriku IDE — installs the soriku-guard MCP server into the engine's MCP client
 * config, so agents and the engine can ask the same policy the IDE enforces.
 *
 * SPDX-License-Identifier: MIT
 ********************************************************************************/

import { inject, injectable } from '@theia/core/shared/inversify';
import { Command, CommandContribution, CommandRegistry, MessageService } from '@theia/core/lib/common';
import { WorkspaceService } from '@theia/workspace/lib/browser/workspace-service';
import { EngineClient } from 'soriku-engine-client-ext/lib/common/engine-client';
import { McpServer } from 'soriku-engine-client-ext/lib/common/engine-types';
import { SorikuShellService } from '../common/shell-service';
import { SorikuGuardService } from './soriku-guard-service';

export const GUARD_SERVER_NAME = 'soriku-guard';
const GUARD_TOOLS = ['guard_check_tool_call', 'guard_scan_text', 'guard_check_path', 'guard_check_command', 'guard_check_instructions'];

export namespace SorikuGuardCommands {
    export const INSTALL: Command = { id: 'soriku.guard.install', category: 'Soriku', label: 'Install Security Guard MCP Server' };
}

@injectable()
export class SorikuGuardContribution implements CommandContribution {

    @inject(EngineClient)
    protected readonly engine: EngineClient;

    @inject(SorikuShellService)
    protected readonly shell: SorikuShellService;

    @inject(WorkspaceService)
    protected readonly workspaceService: WorkspaceService;

    @inject(SorikuGuardService)
    protected readonly guard: SorikuGuardService;

    @inject(MessageService)
    protected readonly messages: MessageService;

    registerCommands(commands: CommandRegistry): void {
        commands.registerCommand(SorikuGuardCommands.INSTALL, { execute: () => this.install() });
    }

    protected async install(): Promise<void> {
        const root = (await this.workspaceService.roots)[0]?.resource.path.toString();
        if (!root) {
            this.messages.warn('Open a folder first: the guard is installed for the current workspace.');
            return;
        }
        try {
            const launch = await this.shell.guardMcpLaunch();
            const entry: McpServer = {
                name: GUARD_SERVER_NAME,
                transport: 'stdio',
                command: launch.command,
                args: [...launch.args, '--root', root],
                env: launch.env,
                enabled: true,
                allowlist: GUARD_TOOLS,
                requires_confirmation: false,   // it only answers questions; it changes nothing
            };
            const current = await this.engine.listMcpServers();
            const servers = [...(current.servers ?? []).filter(s => s.name !== GUARD_SERVER_NAME), entry];
            const saved = await this.engine.putMcpServers(servers, true);
            const health = saved.health?.[GUARD_SERVER_NAME];
            this.messages.info(health && health !== 'ok'
                ? `soriku-guard saved, but the engine could not start it: ${health}`
                : 'soriku-guard installed — agents can now ask the security policy before acting.');
        } catch (e) {
            this.messages.error(`Could not install soriku-guard: ${(e as Error).message}`);
        }
    }
}
