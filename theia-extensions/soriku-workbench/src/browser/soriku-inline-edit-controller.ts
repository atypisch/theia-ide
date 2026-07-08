/********************************************************************************
 * Soriku IDE — ⌘K inline edit: state machine driving the review widget.
 *
 * idle → requesting → reviewing(hunks[], activeHunkIndex) → accepted | discarded → idle
 *
 * Accept re-validates every hunk against the LIVE editor buffer at apply time
 * (not the snapshot the hunks were proposed against) by building one combined
 * unified-diff patch and running it through the already-tested
 * applyUnifiedPatch() — its own strict context-matching IS the conflict
 * detection: if the file changed since the hunks were proposed, the patch's
 * context lines won't match and it throws, which this surfaces as a real
 * "conflicted" status rather than silently corrupting the file.
 *
 * SPDX-License-Identifier: MIT
 ********************************************************************************/

import { inject, injectable } from '@theia/core/shared/inversify';
import { Emitter, Event } from '@theia/core/lib/common';
import { QuickInputService } from '@theia/core/lib/browser';
import { EditorManager } from '@theia/editor/lib/browser/editor-manager';
import { MonacoEditor } from '@theia/monaco/lib/browser/monaco-editor';
import { EngineClient } from 'soriku-engine-client-ext/lib/common/engine-client';
import { InlineEditHunk } from 'soriku-engine-client-ext/lib/common/engine-types';
import { applyUnifiedPatch } from 'soriku-tools-bridge-ext/lib/common/tool-delegation';
import { buildCombinedPatch, countAddedLines, countRemovedLines } from '../common/inline-edit-patch';

export type InlineEditState =
    | { kind: 'idle' }
    | { kind: 'requesting' }
    | { kind: 'reviewing'; title: string; hunks: InlineEditHunk[]; activeHunkIndex: number; editorUri: string; snapshot: string }
    | { kind: 'accepted'; added: number; removed: number }
    | { kind: 'discarded' }
    | { kind: 'conflicted'; message: string };

@injectable()
export class SorikuInlineEditController {

    @inject(EditorManager)
    protected readonly editorManager: EditorManager;

    @inject(EngineClient)
    protected readonly engineClient: EngineClient;

    @inject(QuickInputService)
    protected readonly quickInput: QuickInputService;

    protected _state: InlineEditState = { kind: 'idle' };
    protected readonly onDidChangeStateEmitter = new Emitter<InlineEditState>();
    readonly onDidChangeState: Event<InlineEditState> = this.onDidChangeStateEmitter.event;

    get state(): InlineEditState {
        return this._state;
    }

    protected setState(next: InlineEditState): void {
        this._state = next;
        this.onDidChangeStateEmitter.fire(next);
    }

    /** Public so the review widget can re-check "is this still the right editor?" itself. */
    currentMonacoEditor(): MonacoEditor | undefined {
        return MonacoEditor.getCurrent(this.editorManager);
    }

    /** Entry point for the ⌘K command. No-op (stays idle) outside a real editor or mid-request. */
    async trigger(): Promise<void> {
        if (this._state.kind === 'requesting') {
            return;
        }
        const editor = this.currentMonacoEditor();
        if (!editor) {
            return;
        }
        const control = editor.getControl();
        const model = control.getModel();
        if (!model) {
            return;
        }
        const selection = control.getSelection();
        const selectedText = selection ? model.getValueInRange(selection) : '';
        const instruction = await this.promptInstruction();
        if (!instruction) {
            return;
        }
        this.setState({ kind: 'requesting' });
        const fileContent = model.getValue();
        try {
            const res = await this.engineClient.proposeInlineEdit({
                path: model.uri.toString(),
                language: model.getLanguageId(),
                instruction,
                file_content: fileContent,
                selection: selectedText,
            });
            if (!res.hunks || res.hunks.length === 0) {
                this.setState({ kind: 'idle' });
                return;
            }
            this.setState({
                kind: 'reviewing',
                title: res.title || 'Proposed edit',
                hunks: res.hunks,
                activeHunkIndex: 0,
                editorUri: model.uri.toString(),
                snapshot: fileContent,
            });
        } catch {
            this.setState({ kind: 'idle' });
        }
    }

    protected async promptInstruction(): Promise<string | undefined> {
        return this.quickInput.input({
            title: 'Soriku — Inline Edit',
            placeHolder: 'Describe the change…',
        });
    }

    next(): void {
        if (this._state.kind !== 'reviewing') {
            return;
        }
        const count = this._state.hunks.length;
        this.setState({ ...this._state, activeHunkIndex: (this._state.activeHunkIndex + 1) % count });
    }

    previous(): void {
        if (this._state.kind !== 'reviewing') {
            return;
        }
        const count = this._state.hunks.length;
        this.setState({ ...this._state, activeHunkIndex: (this._state.activeHunkIndex - 1 + count) % count });
    }

    discard(): void {
        if (this._state.kind !== 'reviewing') {
            return;
        }
        this.setState({ kind: 'discarded' });
        this.setState({ kind: 'idle' });
    }

    /**
     * Builds one combined unified-diff patch (hunks sorted by start_line) and
     * applies it in a single Monaco edit operation so the undo stack covers
     * the whole accept as one step.
     */
    acceptAll(): void {
        if (this._state.kind !== 'reviewing') {
            return;
        }
        const { hunks, editorUri, snapshot } = this._state;
        const editor = this.currentMonacoEditor();
        const control = editor?.getControl();
        const model = control?.getModel();
        if (!editor || !control || !model || model.uri.toString() !== editorUri) {
            this.setState({ kind: 'conflicted', message: 'The editor changed — reopen ⌘K to try again.' });
            return;
        }
        const liveText = model.getValue();
        const patch = buildCombinedPatch(hunks);
        let updated: string;
        try {
            updated = applyUnifiedPatch(liveText, patch);
        } catch (e) {
            this.setState({ kind: 'conflicted', message: `The file changed since this edit was proposed: ${(e as Error).message}` });
            return;
        }
        const fullRange = model.getFullModelRange();
        // ICursorStateComputer's return type is `Selection[] | null` — Monaco's own API, not ours.
        // eslint-disable-next-line no-null/no-null
        model.pushEditOperations([], [{ range: fullRange, text: updated }], () => null);
        const added = countAddedLines(snapshot, updated);
        const removed = countRemovedLines(snapshot, updated);
        this.setState({ kind: 'accepted', added, removed });
        this.setState({ kind: 'idle' });
    }

    reset(): void {
        this.setState({ kind: 'idle' });
    }
}
