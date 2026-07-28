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
import { PreferenceService } from '@theia/core/lib/common';
import { FileService } from '@theia/filesystem/lib/browser/file-service';
import { WorkspaceService } from '@theia/workspace/lib/browser/workspace-service';
import { EngineClient } from 'soriku-engine-client-ext/lib/common/engine-client';
import { SorikuSseEvent, ToolExecResult } from 'soriku-engine-client-ext/lib/common/engine-types';
import { describeToolConfirmation, parseConfirmToolEvent } from '../common/tool-confirmation';
import {
    DELEGATED_TOOLS, ToolRequest, applyUnifiedPatch, computeLineDiffStats, errorResult, formatDirectoryListing,
    formatSearchResults, formatWriteResult, getBooleanArg, getNumberArg, getStringArg, isDangerousShellCommand,
    isPathWithinRoot, okResult, parseToolRequestEvent, pathKind, sessionAllowKey, truncateToMaxLines,
} from '../common/tool-delegation';
import { DEFAULT_SHELL_TIMEOUT_MS, RipgrepHit, SorikuShellService, formatShellResult } from '../common/shell-service';
import {
    AutoApproveLevel, DEFAULT_AUTO_APPLY_EDITS, DEFAULT_AUTO_APPROVE, SORIKU_AUTO_APPLY_EDITS, SORIKU_AUTO_APPROVE,
} from './soriku-tools-preferences';
import { SorikuEditorRevealService } from './soriku-editor-reveal-service';
import { SorikuToolApprovalBridge } from './soriku-tool-approval-bridge';
import { SorikuDiffReviewService } from './soriku-diff-review-service';
import { SorikuGeneratedFilesTracker } from './soriku-generated-files-tracker';

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

    @inject(SorikuDiffReviewService)
    protected readonly diffReview: SorikuDiffReviewService;

    @inject(SorikuGeneratedFilesTracker)
    protected readonly generatedFiles: SorikuGeneratedFilesTracker;

    @inject(SorikuShellService)
    protected readonly shellService: SorikuShellService;

    @inject(PreferenceService)
    protected readonly preferences: PreferenceService;

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
            SESSION_ALLOW.add(sessionAllowKey(request.tool, request.args));
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
        if (SESSION_ALLOW.has(sessionAllowKey(request.tool, request.args))) {
            return true;
        }
        // File writes get a diff review (see proposed changes, then accept/reject)
        // instead of a plain banner. shell_exec keeps the banner — there's no diff.
        if (request.tool === 'file_write' || request.tool === 'apply_patch') {
            return this.reviewWrite(request);
        }
        const autoApprove = this.preferences.get<AutoApproveLevel>(SORIKU_AUTO_APPROVE, DEFAULT_AUTO_APPROVE);
        if (autoApprove === 'all') {
            return true;
        }
        if (autoApprove === 'safe' && !this.isDangerousShellRequest(request)) {
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
            SESSION_ALLOW.add(sessionAllowKey(request.tool, request.args));
        }
        return approved;
    }

    /** Whether `safe` auto-approve should still stop and ask for this request (only shell_exec carries a raw command to inspect). */
    protected isDangerousShellRequest(request: ToolRequest): boolean {
        if (request.tool !== 'shell_exec') {
            return false;
        }
        const cmd = getStringArg(request.args, 'command') ?? getStringArg(request.args, 'cmd') ?? '';
        return isDangerousShellCommand(cmd);
    }

    protected async promptUser(
        tool: string,
        view: import('../common/tool-confirmation').ToolConfirmationView,
        confirmationId: string,
    ): Promise<{ approved: boolean; rememberSession: boolean }> {
        return this.approvalBridge.prompt(confirmationId, tool, view);
    }

    /**
     * Compute the full proposed content for a file_write / apply_patch and show it
     * as a diff for the user to accept or reject — before anything is written.
     */
    protected async reviewWrite(request: ToolRequest): Promise<boolean> {
        const uri = await this.resolveUri(getStringArg(request.args, 'path') ?? '');
        let proposed: string;
        if (request.tool === 'apply_patch') {
            const patch = getStringArg(request.args, 'patch') ?? getStringArg(request.args, 'content') ?? '';
            let existing = '';
            try {
                existing = (await this.fileService.read(uri)).value;
            } catch {
                existing = '';
            }
            proposed = applyUnifiedPatch(existing, patch);
        } else {
            proposed = getStringArg(request.args, 'content') ?? '';
        }
        const autoApply = this.preferences.get<boolean>(SORIKU_AUTO_APPLY_EDITS, DEFAULT_AUTO_APPLY_EDITS);
        const { approved, rememberSession } = await this.diffReview.reviewProposedWrite(
            uri, proposed, request.tool, { blocking: !autoApply },
        );
        if (approved && rememberSession) {
            SESSION_ALLOW.add(sessionAllowKey(request.tool, request.args));
        }
        return approved;
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
            let before = '';
            try {
                before = (await this.fileService.read(uri)).value;
            } catch {
                before = '';
            }
            await this.fileService.write(uri, text);
            const result = okResult(formatWriteResult(uri.path.toString(), uri.path.base, text.length));
            // Keyed by the tool call's own raw `path` arg — the same string
            // chat-model.ts reads off the SSE event to build generatedFiles,
            // so the chat widget's DiffBar lookup matches without depending
            // on this service's own URI-resolution/normalization.
            this.recordDiffStats(getStringArg(request.args, 'path') ?? uri.path.toString(), before, text);
            await this.editorReveal.revealPath(uri.path.toString());
            return result;
        }
        if (request.tool === 'apply_patch') {
            const patch = getStringArg(request.args, 'patch') ?? getStringArg(request.args, 'content') ?? '';
            const existing = await this.fileService.read(uri);
            const updated = applyUnifiedPatch(existing.value, patch);
            await this.fileService.write(uri, updated);
            const result = okResult(formatWriteResult(uri.path.toString(), uri.path.base, updated.length));
            this.recordDiffStats(getStringArg(request.args, 'path') ?? uri.path.toString(), existing.value, updated);
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
            const cwdArg = getStringArg(request.args, 'cwd');
            const cwdUri = await this.resolveUri(cwdArg ?? '');
            const cwd = cwdUri.path.toString();
            const timeoutSeconds = getNumberArg(request.args, 'timeout');
            const timeoutMs = timeoutSeconds ? Math.min(Math.max(timeoutSeconds, 1), 600) * 1000 : undefined;
            if (getBooleanArg(request.args, 'background')) {
                const { jobId } = await this.shellService.startJob({ command: cmd, cwd, timeoutMs });
                return okResult(JSON.stringify({ job_id: jobId, started: cmd }));
            }
            const result = await this.shellService.exec({ command: cmd, cwd, timeoutMs });
            return okResult(formatShellResult(result, (timeoutMs ?? DEFAULT_SHELL_TIMEOUT_MS) / 1000));
        }
        if (request.tool === 'shell_job_status') {
            const jobId = getStringArg(request.args, 'job_id') ?? '';
            const status = await this.shellService.pollJob(jobId);
            return okResult(JSON.stringify(status));
        }
        if (request.tool === 'shell_job_stop') {
            const jobId = getStringArg(request.args, 'job_id') ?? '';
            const stopped = await this.shellService.stopJob(jobId);
            return okResult(JSON.stringify({ stopped }));
        }
        return errorResult(`Unsupported tool: ${request.tool}`);
    }

    /** Records real added/removed line stats for the chat DiffBar; silently skips if the diff is too large to compute cheaply. */
    protected recordDiffStats(path: string, before: string, after: string): void {
        const stats = computeLineDiffStats(before, after);
        if (stats) {
            this.generatedFiles.record(path, stats);
        }
    }

    /**
     * Resolve a tool path argument against the workspace root, CONTAINED to it (#11):
     * an absolute path outside the root or a relative path that climbs out via `..` is
     * refused rather than silently reaching the host filesystem.
     */
    protected async resolveUri(path: string): Promise<URI> {
        const roots = await this.workspaceService.roots;
        const root = roots[0]?.resource;
        if (!root) {
            throw new Error('No workspace folder is open — open a folder to let agents use file tools.');
        }
        let candidate: URI;
        switch (pathKind(path)) {
            case 'root': return root;
            case 'absolute': candidate = root.withPath(path); break;
            default: candidate = root.resolve(path); break;
        }
        if (!isPathWithinRoot(root.path.toString(), candidate.path.toString())) {
            throw new Error(`Refused: "${path}" resolves outside the workspace folder.`);
        }
        return candidate;
    }

    /** Fast workspace search via the backend's bundled ripgrep; falls back to a shallow walk if the backend RPC itself is unreachable. */
    protected async searchWorkspace(query: string, subpath?: string): Promise<RipgrepHit[]> {
        if (!query.trim()) {
            return [];
        }
        const roots = await this.workspaceService.roots;
        const root = roots[0]?.resource;
        if (!root) {
            return [];
        }
        const requested = subpath ? root.resolve(subpath) : root;
        // Contain the search to the workspace: a subpath that climbs out (#11) falls back to root.
        const base = isPathWithinRoot(root.path.toString(), requested.path.toString()) ? requested : root;
        try {
            return await this.shellService.search(query, base.path.toString());
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
        const requested = subpath ? root.resolve(subpath) : root;
        // Contain the search to the workspace: a subpath that climbs out (#11) falls back to root.
        const base = isPathWithinRoot(root.path.toString(), requested.path.toString()) ? requested : root;
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
