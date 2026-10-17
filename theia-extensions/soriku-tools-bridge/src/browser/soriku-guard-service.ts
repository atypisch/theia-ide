/********************************************************************************
 * Soriku IDE — soriku-guard in the IDE: the mandatory check before ANY delegated tool
 * runs, the audit log, and redaction of what goes back to the model.
 *
 * The rules live in common/guard-policy.ts (pure, shared with the soriku-guard MCP
 * server). This service adds what needs IO: resolving symlinks through the backend,
 * writing `.soriku/guard.log`, and the workspace root.
 *
 * SPDX-License-Identifier: MIT
 ********************************************************************************/

import URI from '@theia/core/lib/common/uri';
import { Emitter, Event } from '@theia/core/lib/common';
import { inject, injectable } from '@theia/core/shared/inversify';
import { FileService } from '@theia/filesystem/lib/browser/file-service';
import { WorkspaceService } from '@theia/workspace/lib/browser/workspace-service';
import { GuardDecision, auditTarget, evaluateToolCall, redactSecrets } from '../common/guard-policy';
import { SorikuShellService } from '../common/shell-service';
import { normalizePosixPath } from '../common/tool-delegation';

const SORIKU_DIR = '.soriku';
const GUARD_LOG = 'guard.log';
const LOG_GITIGNORE = 'checkpoints/\nguard.log\n';
/** Keep the log bounded: beyond this many characters the oldest half is dropped. */
const LOG_MAX_CHARS = 200_000;

export interface GuardEvent {
    tool: string;
    decision: GuardDecision;
}

@injectable()
export class SorikuGuardService {

    @inject(FileService)
    protected readonly fileService: FileService;

    @inject(WorkspaceService)
    protected readonly workspaceService: WorkspaceService;

    @inject(SorikuShellService)
    protected readonly shell: SorikuShellService;

    protected readonly onDidDecideEmitter = new Emitter<GuardEvent>();
    /** Fires for every non-allow decision (the UI can surface it). */
    readonly onDidDecide: Event<GuardEvent> = this.onDidDecideEmitter.event;

    protected denied = 0;
    protected confirmed = 0;
    protected logQueue: Promise<void> = Promise.resolve();

    get stats(): { denied: number; confirmed: number } {
        return { denied: this.denied, confirmed: this.confirmed };
    }

    protected async root(): Promise<URI | undefined> {
        return (await this.workspaceService.roots)[0]?.resource;
    }

    /** Evaluates a delegated tool call. A fail-closed default: with no workspace nothing may run. */
    async evaluate(tool: string, args: Record<string, unknown>): Promise<GuardDecision> {
        const root = await this.root();
        if (!root) {
            return { verdict: 'deny', rule: 'no-workspace', reasons: ['No workspace folder is open.'] };
        }
        const rootPath = root.path.toString();
        const target = typeof args.path === 'string' ? args.path : '';
        let resolvedPath: string | undefined;
        if (target && ['file_write', 'apply_patch', 'file_read', 'list_directory', 'project_search'].includes(tool)) {
            const abs = target.startsWith('/') ? normalizePosixPath(target) : normalizePosixPath(`${rootPath}/${target}`);
            try {
                resolvedPath = await this.shell.realpath(abs);
            } catch { /* the backend could not resolve it; the lexical check still applies */ }
        }
        const decision = evaluateToolCall({ tool, args, workspaceRoot: rootPath, resolvedPath });
        if (decision.verdict !== 'allow') {
            if (decision.verdict === 'deny') { this.denied++; } else { this.confirmed++; }
            this.onDidDecideEmitter.fire({ tool, decision });
        }
        this.audit(tool, args, decision);
        return decision;
    }

    /** Removes secrets from text on its way to the model. Returns the text unchanged when there is none. */
    redact(text: string | undefined): { text: string | undefined; count: number } {
        if (!text) { return { text, count: 0 }; }
        return redactSecrets(text);
    }

    /** Appends one line to `.soriku/guard.log` — rule ids and targets, never secret values. Best effort. */
    audit(tool: string, args: Record<string, unknown>, decision: GuardDecision): void {
        if (decision.verdict === 'allow') { return; }   // the log is for what the guard stopped or asked about
        const line = `${new Date().toISOString()}\t${decision.verdict}\t${decision.rule}\t${tool}\t${auditTarget(tool, args)}\n`;
        this.logQueue = this.logQueue.then(() => this.append(line)).catch(() => undefined);
    }

    protected async append(line: string): Promise<void> {
        const root = await this.root();
        if (!root) { return; }
        const dir = root.resolve(SORIKU_DIR);
        const ignore = dir.resolve('.gitignore');
        if (!await this.fileService.exists(ignore)) {
            await this.fileService.write(ignore, LOG_GITIGNORE);
        }
        const log = dir.resolve(GUARD_LOG);
        let existing = '';
        try {
            if (await this.fileService.exists(log)) { existing = (await this.fileService.read(log)).value; }
        } catch { /* start fresh */ }
        const combined = existing + line;
        await this.fileService.write(log, combined.length > LOG_MAX_CHARS ? combined.slice(combined.length / 2) : combined);
    }
}
