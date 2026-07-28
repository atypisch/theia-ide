/********************************************************************************
 * Soriku IDE — diff review service
 *
 * Before an agent-proposed file write lands on disk, show a Monaco diff
 * (current content vs proposed content) and let the user Accept or Reject.
 * The proposed side is an in-memory resource — nothing is written until the
 * user accepts. Pure IDE-side: reuses the engine's existing
 * tool_request → confirmTool round-trip via {@link SorikuToolConfirmationService}.
 *
 * SPDX-License-Identifier: MIT
 ********************************************************************************/

import { DiffUris } from '@theia/core/lib/browser/diff-uris';
import { OpenerService, open } from '@theia/core/lib/browser/opener-service';
import { MessageService } from '@theia/core/lib/common/message-service';
import { InMemoryResources } from '@theia/core/lib/common/resource';
import URI from '@theia/core/lib/common/uri';
import { inject, injectable } from '@theia/core/shared/inversify';
import { FileService } from '@theia/filesystem/lib/browser/file-service';
import { SorikuConversationLink } from 'soriku-engine-client-ext/lib/browser/soriku-conversation-link';
import { progressiveRevealFrames } from '../common/tool-delegation';

@injectable()
export class SorikuDiffReviewService {

    @inject(OpenerService)
    protected readonly openerService: OpenerService;

    @inject(InMemoryResources)
    protected readonly inMemory: InMemoryResources;

    @inject(MessageService)
    protected readonly messages: MessageService;

    @inject(FileService)
    protected readonly fileService: FileService;

    @inject(SorikuConversationLink)
    protected readonly conversationLink: SorikuConversationLink;

    /** Monotonic id so each review gets unique in-memory URIs (no collisions). */
    protected reviewCounter = 0;

    /** Delay between live-reveal frames (ms). 0 disables the animation. */
    protected revealDelayMs = 35;

    /**
     * Show a diff of the current file (or empty for a new file) against the
     * proposed content and ask the user to Accept, "Always apply this
     * session", or Reject.
     *
     * `opts.blocking = false` (Phase 2 `soriku.tools.autoApplyEdits`) skips
     * the Accept/Reject prompt entirely — the diff still opens (`reveal`,
     * not `activate`, so it doesn't steal focus) purely for visual
     * after-the-fact review, and the write is approved immediately.
     *
     * @returns `approved` (caller should perform the write when true) and
     *          `rememberSession` (caller should session-allowlist the tool
     *          so future writes skip review for the rest of this session).
     */
    async reviewProposedWrite(
        targetUri: URI, proposedContent: string, toolLabel = 'file_write',
        opts?: { blocking?: boolean },
    ): Promise<{ approved: boolean; rememberSession: boolean }> {
        const base = targetUri.path.base || 'file';
        const exists = await this.safeExists(targetUri);
        const id = ++this.reviewCounter;
        const blocking = opts?.blocking !== false;

        // Proposed (right) side — always in-memory; never touches disk. Start
        // blank and grow it live (Fase 1B) so the code appears "typewriter"-style.
        const proposedUri = this.memoryUri(`proposed-${id}`, base);
        const frames = progressiveRevealFrames(proposedContent);
        this.inMemory.add(proposedUri, frames[0]);

        // Original (left) side — the real file when it exists, else an
        // in-memory empty doc so a brand-new file diffs against nothing.
        let originalUri: URI;
        let originalMem: URI | undefined;
        if (exists) {
            originalUri = targetUri;
        } else {
            originalMem = this.memoryUri(`original-${id}`, base);
            this.inMemory.add(originalMem, '');
            originalUri = originalMem;
        }

        const label = `${exists ? 'Edit' : 'New'} · ${base} (${toolLabel})`;
        try {
            const diffUri = DiffUris.encode(originalUri, proposedUri, label);
            await open(this.openerService, diffUri, { mode: blocking ? 'activate' : 'reveal' });

            // Grow the proposed side live so the diff fills in as if typed.
            await this.revealProgressively(proposedUri, frames);

            if (!blocking) {
                this.conversationLink.notifyReviewWrite(true, base);
                return { approved: true, rememberSession: false };
            }

            const verb = exists ? 'changes to' : 'creation of';
            const action = await this.messages.info(
                `Review the proposed ${verb} ${base}, then Accept or Reject.`,
                'Accept',
                'Always apply this session',
                'Reject',
            );
            const approved = action === 'Accept' || action === 'Always apply this session';
            const rememberSession = action === 'Always apply this session';
            // Fase E: the accept/reject is free implicit feedback for the agent.
            this.conversationLink.notifyReviewWrite(approved, base);
            return { approved, rememberSession };
        } catch {
            // If the diff can't be shown, fail safe: do not auto-write.
            const action = await this.messages.warn(
                `Could not open a diff for ${base}. Apply the proposed write anyway?`,
                'Accept',
                'Reject',
            );
            return { approved: action === 'Accept', rememberSession: false };
        } finally {
            this.dispose(proposedUri);
            if (originalMem) {
                this.dispose(originalMem);
            }
        }
    }

    /**
     * Update the proposed in-memory resource through its reveal frames so the
     * open Monaco diff grows live. InMemoryResources.update fires the resource's
     * onDidChangeContents, which the editor model reloads from.
     */
    protected async revealProgressively(uri: URI, frames: string[]): Promise<void> {
        if (this.revealDelayMs <= 0 || frames.length <= 1) {
            this.inMemory.update(uri, frames[frames.length - 1] ?? '');
            return;
        }
        for (let i = 1; i < frames.length; i++) {
            try {
                this.inMemory.update(uri, frames[i]);
            } catch {
                break;
            }
            await new Promise(resolve => setTimeout(resolve, this.revealDelayMs));
        }
    }

    protected memoryUri(slot: string, base: string): URI {
        // Keep the basename last so Monaco infers the language from its extension.
        return new URI().withScheme('soriku-diff').withPath(`/${slot}/${base}`);
    }

    protected async safeExists(uri: URI): Promise<boolean> {
        try {
            return await this.fileService.exists(uri);
        } catch {
            return false;
        }
    }

    protected dispose(uri: URI): void {
        try {
            this.inMemory.resolve(uri).dispose();
        } catch {
            /* already gone */
        }
    }
}
