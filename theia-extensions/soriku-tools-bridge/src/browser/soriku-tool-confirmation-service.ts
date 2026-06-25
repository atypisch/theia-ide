/********************************************************************************
 * Soriku IDE — tool confirmation service
 *
 * Listens (via the chat stream) for engine `confirm_tool` requests, shows an
 * inline approval banner in Soriku Chat (via {@link SorikuToolApprovalBridge}),
 * and posts the decision to the engine.
 *
 * SPDX-License-Identifier: MIT
 ********************************************************************************/

import URI from '@theia/core/lib/common/uri';
import { inject, injectable } from '@theia/core/shared/inversify';
import { FileService } from '@theia/filesystem/lib/browser/file-service';
import { WorkspaceService } from '@theia/workspace/lib/browser/workspace-service';
import { EngineClient } from 'soriku-engine-client-ext/lib/common/engine-client';
import { SorikuSseEvent, ToolExecResult } from 'soriku-engine-client-ext/lib/common/engine-types';
import { describeToolConfirmation, parseConfirmToolEvent } from '../common/tool-confirmation';
import {
    DELEGATED_TOOLS, ToolRequest, applyUnifiedPatch, errorResult, formatDirectoryListing, formatSearchResults,
    formatWriteResult, getNumberArg, getStringArg, okResult, parseToolRequestEvent, pathKind, truncateToMaxLines,
} from '../common/tool-delegation';
import { SorikuEditorRevealService } from './soriku-editor-reveal-service';
import { SorikuToolApprovalBridge } from './soriku-tool-approval-bridge';

/** Session-scoped auto-approve for destructive tools (Allow always). */
const SESSION_ALLOW = new Set<string>();

@injectable()
export class SorikuToolConfirmationService {

    @inject(EngineClient)
    protected readonly engineClient: EngineClient;

    @inject(FileService)
    protected readonly fileService: FileService;

    @inject(WorkspaceService)
    protected readonly workspaceService: WorkspaceService;

    @inject(SorikuEditorRevealService)
    protected readonly editorReveal: SorikuEditorRevealService;

    @inject(SorikuToolApprovalBridge)
    protected readonly approvalBridge: SorikuToolApprovalBridge;

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
        if (!view.destructive) {
            await this.engineClient.confirmTool({
                confirmation_id: request.confirmationId,
                approved: true,
                remember: '',
            });
            return true;
        }
        const { approved, rememberSession } = await this.promptUser(request.tool, view, request.confirmationId);
        if (approved && rememberSession) {
            SESSION_ALLOW.add(request.tool);
        }
        await this.engineClient.confirmTool({
            confirmation_id: request.confirmationId,
            approved,
            remember: rememberSession ? 'session' : '',
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
            } else if ((request.tool === 'file_write' || request.tool === 'apply_patch' || request.tool === 'shell_exec')
                && !(await this.confirmDestructive(request))) {
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
        if (SESSION_ALLOW.has(request.tool)) {
            return true;
        }
        const view = describeToolConfirmation({
            confirmationId: request.requestId,
            tool: request.tool,
            args: request.args,
            iteration: request.iteration,
        });
        const { approved, rememberSession } = await this.promptUser(request.tool, view, request.requestId);
        if (approved && rememberSession) {
            SESSION_ALLOW.add(request.tool);
        }
        return approved;
    }

    protected async promptUser(
        tool: string,
        view: import('../common/tool-confirmation').ToolConfirmationView,
        confirmationId: string,
    ): Promise<{ approved: boolean; rememberSession: boolean }> {
        return this.approvalBridge.prompt(confirmationId, tool, view);
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
            const result = okResult(formatWriteResult(uri.path.toString(), uri.path.base, text.length));
            await this.editorReveal.revealPath(uri.path.toString());
            return result;
        }
        if (request.tool === 'apply_patch') {
            const patch = getStringArg(request.args, 'patch') ?? getStringArg(request.args, 'content') ?? '';
            const existing = await this.fileService.read(uri);
            const updated = applyUnifiedPatch(existing.value, patch);
            await this.fileService.write(uri, updated);
            const result = okResult(formatWriteResult(uri.path.toString(), uri.path.base, updated.length));
            await this.editorReveal.revealPath(uri.path.toString());
            return result;
        }
        if (request.tool === 'project_search') {
            const query = getStringArg(request.args, 'query') ?? getStringArg(request.args, 'pattern') ?? '';
            const hits = await this.searchWorkspace(query, getStringArg(request.args, 'path'));
            return okResult(formatSearchResults(hits));
        }
        if (request.tool === 'shell_exec') {
            const cmd = getStringArg(request.args, 'command') ?? getStringArg(request.args, 'cmd') ?? '';
            const { exec } = await import('child_process');
            const { promisify } = await import('util');
            const run = promisify(exec);
            const roots = await this.workspaceService.roots;
            const cwd = roots[0]?.resource.path.toString() ?? process.cwd();
            const out = await run(cmd, { cwd, timeout: 30000, maxBuffer: 512 * 1024 });
            return okResult((out.stdout || '') + (out.stderr || ''));
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

    /** Fast workspace search via ripgrep; falls back to a shallow walk when rg is unavailable. */
    protected async searchWorkspace(query: string, subpath?: string): Promise<{ path: string; line: number; text: string }[]> {
        if (!query.trim()) {
            return [];
        }
        const roots = await this.workspaceService.roots;
        const root = roots[0]?.resource;
        if (!root) {
            return [];
        }
        const base = subpath ? root.resolve(subpath) : root;
        const basePath = base.path.toString();
        try {
            const { execFile } = await import('child_process');
            const { promisify } = await import('util');
            const run = promisify(execFile);
            const { stdout } = await run(
                'rg',
                [
                    '--line-number', '--no-heading', '--max-count', '50',
                    '--glob', '!node_modules', '--glob', '!.git', '--glob', '!yarn.lock',
                    query, basePath,
                ],
                { timeout: 15000, maxBuffer: 512 * 1024 },
            );
            return stdout.split('\n').filter(Boolean).map(line => {
                const m = line.match(/^(.+?):(\d+):(.*)$/);
                if (!m) {
                    return undefined;
                }
                return { path: m[1], line: parseInt(m[2], 10), text: m[3].trim().slice(0, 200) };
            }).filter((hit): hit is { path: string; line: number; text: string } => !!hit);
        } catch {
            return this.searchWorkspaceWalk(query, subpath);
        }
    }

    /** Fallback when ripgrep is not installed. */
    protected async searchWorkspaceWalk(query: string, subpath?: string): Promise<{ path: string; line: number; text: string }[]> {
        if (!query.trim()) {
            return [];
        }
        const roots = await this.workspaceService.roots;
        const root = roots[0]?.resource;
        if (!root) {
            return [];
        }
        const base = subpath ? root.resolve(subpath) : root;
        const hits: { path: string; line: number; text: string }[] = [];
        const needle = query.toLowerCase();
        const walk = async (uri: URI): Promise<void> => {
            if (hits.length >= 50) {
                return;
            }
            const stat = await this.fileService.resolve(uri);
            if (stat.isDirectory) {
                for (const child of stat.children ?? []) {
                    if (child.name.startsWith('.') || child.name === 'node_modules') {
                        continue;
                    }
                    await walk(child.resource);
                }
                return;
            }
            if (!/\.(ts|tsx|js|jsx|py|html|css|json|md)$/i.test(uri.path.base)) {
                return;
            }
            try {
                const content = await this.fileService.read(uri);
                const lines = content.value.split('\n');
                lines.forEach((text, idx) => {
                    if (text.toLowerCase().includes(needle) && hits.length < 50) {
                        hits.push({ path: uri.path.toString(), line: idx + 1, text: text.trim().slice(0, 200) });
                    }
                });
            } catch {
                /* unreadable file */
            }
        };
        await walk(base);
        return hits;
    }
}
