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

    /**
     * Show a diff of the current file (or empty for a new file) against the
     * proposed content and ask the user to Accept or Reject.
     *
     * @returns true when the user accepts (caller should perform the write),
     *          false when they reject (caller should deny the tool call).
     */
    async reviewProposedWrite(targetUri: URI, proposedContent: string, toolLabel = 'file_write'): Promise<boolean> {
        const base = targetUri.path.base || 'file';
        const exists = await this.safeExists(targetUri);
        const id = ++this.reviewCounter;

        // Proposed (right) side — always in-memory; never touches disk.
        const proposedUri = this.memoryUri(`proposed-${id}`, base);
        this.inMemory.add(proposedUri, proposedContent);

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
            await open(this.openerService, diffUri, { mode: 'activate' });

            const verb = exists ? 'changes to' : 'creation of';
            const action = await this.messages.info(
                `Review the proposed ${verb} ${base}, then Accept or Reject.`,
                'Accept',
                'Reject',
            );
            const accepted = action === 'Accept';
            // Fase E: the accept/reject is free implicit feedback for the agent.
            this.conversationLink.notifyReviewWrite(accepted, base);
            return accepted;
        } catch {
            // If the diff can't be shown, fail safe: do not auto-write.
            const action = await this.messages.warn(
                `Could not open a diff for ${base}. Apply the proposed write anyway?`,
                'Accept',
                'Reject',
            );
            return action === 'Accept';
        } finally {
            this.dispose(proposedUri);
            if (originalMem) {
                this.dispose(originalMem);
            }
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
