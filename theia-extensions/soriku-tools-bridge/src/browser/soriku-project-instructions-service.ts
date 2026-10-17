/********************************************************************************
 * Soriku IDE — per-project instructions (soriku.md).
 *
 * Reads soriku.md (and AGENTS.md / CLAUDE.md as fallbacks) from the workspace root,
 * creates a default soriku.md when a project has none, and hands the approved text to
 * the chat so every request carries it.
 *
 * Safety: an instructions file is project content, so a changed or new one could carry
 * prompt injection (a fresh clone, a pull). It is trusted only after the user approved
 * exactly that text ("trust on first use"); until then the last approved text is used.
 *
 * SPDX-License-Identifier: MIT
 ********************************************************************************/

import URI from '@theia/core/lib/common/uri';
import { Emitter, Event, PreferenceService } from '@theia/core/lib/common';
import { StorageService } from '@theia/core/lib/browser/storage-service';
import { inject, injectable } from '@theia/core/shared/inversify';
import { FileService } from '@theia/filesystem/lib/browser/file-service';
import { WorkspaceService } from '@theia/workspace/lib/browser/workspace-service';
import {
    ApprovedInstructions, FoundInstructions, INSTRUCTION_FILES, InstructionsStatus, combineInstructions, decideInstructions, hashText,
    renderSorikuMd, suspiciousInstructionSignals,
} from 'soriku-engine-client-ext/lib/common/soriku-md';
import { ProjectFiles, detectStack } from 'soriku-engine-client-ext/lib/common/stack-detect';
import { DEFAULT_CREATE_DEFAULT_INSTRUCTIONS, SORIKU_CREATE_DEFAULT_INSTRUCTIONS } from './soriku-tools-preferences';

const STORAGE_KEY = 'soriku.instructions.approved';
const DETECT_FILES: Array<keyof ProjectFiles> = ['package.json', 'composer.json', 'pyproject.toml', 'requirements.txt', 'Makefile', 'go.mod', 'Cargo.toml'];

export interface InstructionsState {
    status: InstructionsStatus;
    /** File names found in the workspace root. */
    files: string[];
    /** Injection-style signals in the current text (shown while it awaits review). */
    signals: string[];
}

@injectable()
export class SorikuProjectInstructionsService {

    @inject(FileService)
    protected readonly fileService: FileService;

    @inject(WorkspaceService)
    protected readonly workspaceService: WorkspaceService;

    @inject(StorageService)
    protected readonly storage: StorageService;

    @inject(PreferenceService)
    protected readonly preferences: PreferenceService;

    protected state: InstructionsState = { status: 'none', files: [], signals: [] };
    protected textForRequest: string | undefined;
    protected currentText = '';
    protected currentHash = '';
    /** Refreshes overlap (a file change fires one while we are still approving); only the latest may apply its result. */
    protected refreshGeneration = 0;

    protected readonly onDidChangeEmitter = new Emitter<InstructionsState>();
    readonly onDidChange: Event<InstructionsState> = this.onDidChangeEmitter.event;

    getState(): InstructionsState {
        return this.state;
    }

    /** The text to send with a request: approved instructions only (see class doc). */
    getTextForRequest(): string | undefined {
        return this.textForRequest;
    }

    protected async rootUri(): Promise<URI | undefined> {
        return (await this.workspaceService.roots)[0]?.resource;
    }

    protected async readApproved(root: URI): Promise<ApprovedInstructions | undefined> {
        const all = await this.storage.getData<Record<string, ApprovedInstructions>>(STORAGE_KEY, {});
        return all?.[root.toString()];
    }

    protected async writeApproved(root: URI, value: ApprovedInstructions): Promise<void> {
        const all = await this.storage.getData<Record<string, ApprovedInstructions>>(STORAGE_KEY, {}) ?? {};
        all[root.toString()] = value;
        await this.storage.setData(STORAGE_KEY, all);
    }

    /** Re-reads the files and re-decides. Cheap; called before every request and when files change. */
    async refresh(): Promise<InstructionsState> {
        const generation = ++this.refreshGeneration;
        const root = await this.rootUri();
        if (!root) {
            return this.set({ status: 'none', files: [], signals: [] }, undefined, '', '');
        }
        const found: FoundInstructions[] = [];
        const seen = new Set<string>();
        for (const name of INSTRUCTION_FILES) {
            // On a case-insensitive filesystem (macOS, Windows) soriku.md and SORIKU.md are ONE file.
            if (seen.has(name.toLowerCase())) { continue; }
            const uri = root.resolve(name);
            try {
                if (await this.fileService.exists(uri)) {
                    seen.add(name.toLowerCase());
                    found.push({ name, content: (await this.fileService.read(uri)).value });
                }
            } catch { /* unreadable → treated as absent */ }
        }
        const text = combineInstructions(found);
        const hash = text ? await hashText(text) : '';
        const decision = decideInstructions(text, hash, await this.readApproved(root));
        if (generation !== this.refreshGeneration) {
            return this.state;   // a newer refresh started meanwhile; its result is the truth
        }
        return this.set({
            status: decision.status,
            files: found.map(f => f.name),
            signals: decision.status === 'review' ? suspiciousInstructionSignals(text) : [],
        }, decision.textForRequest, text, hash);
    }

    protected set(state: InstructionsState, textForRequest: string | undefined, currentText: string, currentHash: string): InstructionsState {
        const changed = state.status !== this.state.status || state.files.join() !== this.state.files.join()
            || state.signals.join() !== this.state.signals.join();
        this.state = state;
        this.textForRequest = textForRequest;
        this.currentText = currentText;
        this.currentHash = currentHash;
        if (changed) {
            this.onDidChangeEmitter.fire(state);
        }
        return state;
    }

    /** The user reviewed the current text and trusts it. */
    async approve(): Promise<void> {
        const root = await this.rootUri();
        if (!root || !this.currentText) { return; }
        await this.writeApproved(root, { hash: this.currentHash, text: this.currentText });
        await this.refresh();
    }

    /** Creates a default soriku.md when the project has no instruction file at all. Returns the new file's URI. */
    async ensureDefault(): Promise<URI | undefined> {
        // Several triggers (workspace ready / changed) run this at once: share one in-flight attempt.
        if (!this.creating) {
            this.creating = this.createDefaultOnce().finally(() => { this.creating = undefined; });
            return this.creating;
        }
        await this.creating;
        return undefined;
    }

    protected creating: Promise<URI | undefined> | undefined;

    protected async createDefaultOnce(): Promise<URI | undefined> {
        if (this.preferences.get<boolean>(SORIKU_CREATE_DEFAULT_INSTRUCTIONS, DEFAULT_CREATE_DEFAULT_INSTRUCTIONS) === false) {
            return undefined;
        }
        const root = await this.rootUri();
        if (!root) { return undefined; }
        const state = await this.refresh();
        if (state.files.length > 0) { return undefined; }
        const projectFiles: ProjectFiles = {};
        for (const name of DETECT_FILES) {
            try {
                const uri = root.resolve(name);
                if (await this.fileService.exists(uri)) { projectFiles[name] = (await this.fileService.read(uri)).value; }
            } catch { /* ignore */ }
        }
        const target = root.resolve('soriku.md');
        const content = renderSorikuMd(detectStack(projectFiles), root.path.name || 'this project');
        try {
            await this.fileService.create(target, content);
        } catch {
            return undefined;   // read-only folder or a racing creation — not an error worth surfacing
        }
        // We wrote it ourselves, so it is trusted from the start.
        const approvedText = combineInstructions([{ name: 'soriku.md', content }]);
        await this.writeApproved(root, { hash: await hashText(approvedText), text: approvedText });
        await this.refresh();
        return target;
    }

    /** The file to open for review: soriku.md if present, else the first instruction file. */
    async primaryFile(): Promise<URI | undefined> {
        const root = await this.rootUri();
        const name = this.state.files[0];
        return root && name ? root.resolve(name) : undefined;
    }
}
