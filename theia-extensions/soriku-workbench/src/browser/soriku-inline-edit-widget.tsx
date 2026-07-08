/********************************************************************************
 * Soriku IDE — ⌘K inline edit review card: a Monaco IContentWidget anchored
 * under the active hunk, plus a decoration highlighting the range that hunk
 * will replace. There is no existing IContentWidget precedent anywhere in
 * this codebase (confirmed by search) — this is built directly against the
 * raw monaco-editor-core API, same spirit as the existing inline-completion
 * provider (soriku-inline-completion.ts) which also bypasses the VS Code
 * workbench diff widgets this app's Monaco build doesn't have.
 *
 * SPDX-License-Identifier: MIT
 ********************************************************************************/

import * as React from '@theia/core/shared/react';
import { createRoot, Root } from '@theia/core/shared/react-dom/client';
import * as monaco from '@theia/monaco-editor-core';
import { MonacoEditor } from '@theia/monaco/lib/browser/monaco-editor';
import { InlineEditHunk } from 'soriku-engine-client-ext/lib/common/engine-types';
import { Btn, Card } from 'soriku-theme-ext/lib/browser/ui';
import { InlineEditState, SorikuInlineEditController } from './soriku-inline-edit-controller';

const WIDGET_ID = 'soriku.inlineEdit.reviewCard';

export class SorikuInlineEditWidget implements monaco.editor.IContentWidget {

    readonly allowEditorOverflow = true;
    protected readonly domNode: HTMLElement;
    protected readonly root: Root;
    protected editor: MonacoEditor | undefined;
    protected decorations: monaco.editor.IEditorDecorationsCollection | undefined;
    protected position: monaco.IPosition | undefined;
    protected attached = false;

    constructor(protected readonly controller: SorikuInlineEditController) {
        this.domNode = document.createElement('div');
        this.domNode.className = 'soriku-inline-edit-widget';
        this.root = createRoot(this.domNode);
        this.controller.onDidChangeState(state => this.onStateChanged(state));
    }

    getId(): string {
        return WIDGET_ID;
    }

    getDomNode(): HTMLElement {
        return this.domNode;
    }

    getPosition(): monaco.editor.IContentWidgetPosition | null {
        if (!this.position) {
            // IContentWidget.getPosition()'s return type is Monaco's own API contract.
            // eslint-disable-next-line no-null/no-null
            return null;
        }
        return {
            position: this.position,
            preference: [
                monaco.editor.ContentWidgetPositionPreference.BELOW,
                monaco.editor.ContentWidgetPositionPreference.ABOVE,
            ],
        };
    }

    protected onStateChanged(state: InlineEditState): void {
        if (state.kind === 'reviewing') {
            this.show(state);
        } else {
            this.hide();
            if (state.kind === 'conflicted') {
                // eslint-disable-next-line no-console
                console.warn(`Soriku inline edit: ${state.message}`);
            }
        }
    }

    protected show(state: Extract<InlineEditState, { kind: 'reviewing' }>): void {
        const editor = this.controller.currentMonacoEditor();
        if (!editor || editor.getControl().getModel()?.uri.toString() !== state.editorUri) {
            this.controller.discard();
            return;
        }
        this.editor = editor;
        const control = editor.getControl();
        if (!this.decorations) {
            this.decorations = control.createDecorationsCollection();
        }
        const hunk = state.hunks[state.activeHunkIndex];
        this.decorations.set([{
            range: new monaco.Range(hunk.start_line, 1, hunk.end_line, 1),
            options: {
                isWholeLine: true,
                className: 'soriku-inline-edit-hunk-range',
                stickiness: monaco.editor.TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges,
            },
        }]);
        this.position = { lineNumber: hunk.end_line, column: 1 };
        if (!this.attached) {
            control.addContentWidget(this);
            this.attached = true;
        } else {
            control.layoutContentWidget(this);
        }
        this.renderCard(state, hunk);
    }

    protected hide(): void {
        this.decorations?.clear();
        if (this.attached && this.editor) {
            this.editor.getControl().removeContentWidget(this);
            this.attached = false;
        }
        this.root.render(undefined);
    }

    protected renderCard(state: Extract<InlineEditState, { kind: 'reviewing' }>, hunk: InlineEditHunk): void {
        const count = state.hunks.length;
        const index = state.activeHunkIndex;
        this.root.render(
            <Card className='soriku-inline-edit-card'>
                <div className='soriku-inline-edit-card-header'>
                    <span className='codicon codicon-sparkle' />
                    <span className='soriku-inline-edit-card-title'>{state.title}</span>
                    <span className='soriku-inline-edit-card-chip'>⌘K</span>
                </div>
                {count > 1 && <div className='soriku-inline-edit-card-nav'>
                    <button className='soriku-inline-edit-chevron' onClick={() => this.controller.previous()} title='Previous change (⇧Tab)'>
                        <span className='codicon codicon-chevron-left' />
                    </button>
                    <span className='soriku-inline-edit-card-count'>{`Change ${index + 1} of ${count}`}</span>
                    <button className='soriku-inline-edit-chevron' onClick={() => this.controller.next()} title='Next change (Tab)'>
                        <span className='codicon codicon-chevron-right' />
                    </button>
                </div>}
                {hunk.description && <div className='soriku-inline-edit-card-desc'>{hunk.description}</div>}
                <div className='soriku-inline-edit-card-actions'>
                    <Btn variant='secondary' onClick={() => this.controller.discard()}>Discard</Btn>
                    <Btn onClick={() => this.controller.acceptAll()}>Accept all</Btn>
                </div>
                <div className='soriku-inline-edit-card-footer'>
                    Tab / ⇧Tab to navigate · ⌘⏎ to accept · Esc to discard
                </div>
            </Card>,
        );
    }

    dispose(): void {
        this.hide();
        this.root.unmount();
    }
}
