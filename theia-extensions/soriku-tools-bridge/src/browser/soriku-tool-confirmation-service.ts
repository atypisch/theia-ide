/********************************************************************************
 * Soriku IDE — tool confirmation service
 *
 * Listens (via the chat stream) for engine `confirm_tool` requests, shows a
 * default-deny confirmation dialog, and posts the decision to the engine.
 *
 * SPDX-License-Identifier: MIT
 ********************************************************************************/

import URI from '@theia/core/lib/common/uri';
import { inject, injectable } from '@theia/core/shared/inversify';
import { ConfirmDialog } from '@theia/core/lib/browser/dialogs';
import { FileService } from '@theia/filesystem/lib/browser/file-service';
import { WorkspaceService } from '@theia/workspace/lib/browser/workspace-service';
import { EngineClient } from 'soriku-engine-client-ext/lib/common/engine-client';
import { SorikuSseEvent, ToolExecResult } from 'soriku-engine-client-ext/lib/common/engine-types';
import { describeToolConfirmation, parseConfirmToolEvent } from '../common/tool-confirmation';
import {
    DELEGATED_TOOLS, ToolRequest, errorResult, formatDirectoryListing, formatWriteResult,
    getNumberArg, getStringArg, okResult, parseToolRequestEvent, pathKind, truncateToMaxLines,
} from '../common/tool-delegation';

@injectable()
export class SorikuToolConfirmationService {

    @inject(EngineClient)
    protected readonly engineClient: EngineClient;

    @inject(FileService)
    protected readonly fileService: FileService;

    @inject(WorkspaceService)
    protected readonly workspaceService: WorkspaceService;

    /** Tools the IDE can execute locally — sent to the engine as `client_tools`. */
    delegatedTools(): string[] {
        return [...DELEGATED_TOOLS];
    }

    /**
     * Handle a single `confirm_tool` event: ask the user (default deny) and report the decision to
     * the engine, which then runs or skips the tool server-side. Safe to call fire-and-forget; the
     * engine blocks until /api/worker/confirm arrives, so the chat stream resumes after this resolves.
     */
    async confirm(event: SorikuSseEvent): Promise<boolean> {
        const request = parseConfirmToolEvent(event);
        if (!request) {
            return false;
        }
        const view = describeToolConfirmation(request);
        let approved = false;
        try {
            const dialog = new ConfirmDialog({
                title: view.title,
                msg: this.renderMessage(view.message),
                ok: 'Allow once',
                cancel: 'Deny',
            });
            approved = (await dialog.open()) === true;
        } catch {
            approved = false; // default deny on any dialog failure
        }
        await this.engineClient.confirmTool({
            confirmation_id: request.confirmationId,
            approved,
            remember: '',
        });
        return approved;
    }

    /**
     * Handle a single delegated `tool_request` event: execute the tool against the open
     * workspace (confirming destructive ones first) and POST the result to the engine, which
     * then resumes the agent loop. Safe to call fire-and-forget like {@link confirm}.
     */
    async executeDelegated(event: SorikuSseEvent): Promise<void> {
        const request = parseToolRequestEvent(event);
        if (!request) {
            return;
        }
        let approved = true;
        let result: ToolExecResult;
        try {
            if (!DELEGATED_TOOLS.includes(request.tool)) {
                result = errorResult(`Tool ${request.tool} cannot be executed in the IDE.`);
            } else if (request.tool === 'file_write' && !(await this.confirmDestructive(request))) {
                approved = false;
                result = errorResult('Tool call denied by user.');
            } else {
                result = await this.runTool(request);
            }
        } catch (e) {
            result = errorResult((e as Error).message);
        }
        await this.engineClient.confirmTool({
            confirmation_id: request.requestId,
            approved,
            remember: '',
            result,
        });
    }

    protected async confirmDestructive(request: ToolRequest): Promise<boolean> {
        const view = describeToolConfirmation({
            confirmationId: request.requestId,
            tool: request.tool,
            args: request.args,
            iteration: request.iteration,
        });
        try {
            const dialog = new ConfirmDialog({
                title: view.title,
                msg: this.renderMessage(view.message),
                ok: 'Allow once',
                cancel: 'Deny',
            });
            return (await dialog.open()) === true;
        } catch {
            return false; // default deny on any dialog failure
        }
    }

    protected async runTool(request: ToolRequest): Promise<ToolExecResult> {
        const uri = await this.resolveUri(getStringArg(request.args, 'path') ?? '');
        if (request.tool === 'file_read') {
            const content = await this.fileService.read(uri);
            return okResult(truncateToMaxLines(content.value, getNumberArg(request.args, 'max_lines') ?? 200));
        }
        if (request.tool === 'list_directory') {
            const stat = await this.fileService.resolve(uri);
            const entries = (stat.children ?? []).map(child => ({
                name: child.resource.path.base,
                isDirectory: child.isDirectory,
            }));
            return okResult(formatDirectoryListing(entries));
        }
        if (request.tool === 'file_write') {
            const text = getStringArg(request.args, 'content') ?? '';
            await this.fileService.write(uri, text);
            return okResult(formatWriteResult(uri.path.toString(), uri.path.base, text.length));
        }
        return errorResult(`Unsupported tool: ${request.tool}`);
    }

    /** Resolve a tool path argument against the workspace root (absolute paths used as-is). */
    protected async resolveUri(path: string): Promise<URI> {
        const roots = await this.workspaceService.roots;
        const root = roots[0]?.resource;
        if (!root) {
            throw new Error('No workspace folder is open — open a folder to let agents use file tools.');
        }
        switch (pathKind(path)) {
            case 'root': return root;
            case 'absolute': return root.withPath(path);
            default: return root.resolve(path);
        }
    }

    protected renderMessage(message: string): HTMLElement {
        const node = document.createElement('div');
        node.style.whiteSpace = 'pre-wrap';
        node.style.maxWidth = '480px';
        node.textContent = message;
        return node;
    }
}
