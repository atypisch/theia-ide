/********************************************************************************
 * Soriku IDE — inline (ghost-text) code completion
 *
 * Registers a Monaco inline-completion provider that fills in code at the cursor
 * via the engine's local fill-in-the-middle model (qwen2.5-coder). Local-first,
 * fast, debounced, and silent on failure — Tab accepts the suggestion. This is
 * Soriku's answer to Cursor's tab-completion.
 *
 * SPDX-License-Identifier: MIT
 ********************************************************************************/

import * as monaco from '@theia/monaco-editor-core';
import { inject, injectable } from '@theia/core/shared/inversify';
import { FrontendApplicationContribution } from '@theia/core/lib/browser/frontend-application-contribution';
import { PreferenceService } from '@theia/core/lib/common';
import { EngineClient } from '../common/engine-client';
import { sliceCursorAffixes } from '../common/editor-context';

/** Pref to toggle inline completion (default on). */
export const SORIKU_INLINE_COMPLETION_ENABLED = 'soriku.completion.inlineEnabled';

const MAX_PREFIX_CHARS = 2000;   // cap context sent to the engine (latency + tokens)
const MAX_SUFFIX_CHARS = 1000;
const DEBOUNCE_MS = 180;         // wait for a typing pause before asking
const MAX_TOKENS = 64;

@injectable()
export class SorikuInlineCompletionContribution implements FrontendApplicationContribution {

    @inject(EngineClient)
    protected readonly engine: EngineClient;

    @inject(PreferenceService)
    protected readonly preferences: PreferenceService;

    // #20: keep the provider registration so it can be disposed and a second
    // onStart can never double-register.
    protected registration: monaco.IDisposable | undefined;

    onStop(): void {
        this.registration?.dispose();
        this.registration = undefined;
    }

    onStart(): void {
        if (this.registration) {
            return;
        }
        this.registration = monaco.languages.registerInlineCompletionsProvider({ pattern: '**' }, {
            provideInlineCompletions: async (model, position, _context, token) => {
                if (this.preferences.get<boolean>(SORIKU_INLINE_COMPLETION_ENABLED, true) === false) {
                    return undefined;
                }
                // Debounce: Monaco cancels the prior request when a new one starts,
                // so a short delay + token check coalesces fast typing.
                await new Promise(resolve => setTimeout(resolve, DEBOUNCE_MS));
                if (token.isCancellationRequested) {
                    return undefined;
                }

                const prefixFull = model.getValueInRange(new monaco.Range(
                    1, 1, position.lineNumber, position.column,
                ));
                const lastLine = model.getLineCount();
                const lastColumn = model.getLineMaxColumn(lastLine);
                const suffixFull = model.getValueInRange(new monaco.Range(
                    position.lineNumber, position.column, lastLine, lastColumn,
                ));
                // Line-aware window (C-E): the far ends snap to line boundaries so the
                // FIM model never sees a mid-token first/last line.
                const { prefix, suffix } = sliceCursorAffixes(prefixFull, suffixFull, MAX_PREFIX_CHARS, MAX_SUFFIX_CHARS);
                if (!prefix.trim() && !suffix.trim()) {
                    return undefined;
                }

                try {
                    const res = await this.engine.complete({
                        prefix,
                        suffix,
                        language: model.getLanguageId(),
                        path: model.uri.toString(),
                        max_tokens: MAX_TOKENS,
                    });
                    const text = (res?.completion ?? '').replace(/\s+$/, '');  // keep leading, trim trailing
                    if (!text || token.isCancellationRequested) {
                        return undefined;
                    }
                    return {
                        items: [{
                            insertText: text,
                            // Pure insertion at the cursor.
                            range: new monaco.Range(
                                position.lineNumber, position.column,
                                position.lineNumber, position.column,
                            ),
                        }],
                    };
                } catch {
                    return undefined;  // silent: completion is a nicety, never an error
                }
            },
            // Nothing stateful to release per result set.
            disposeInlineCompletions: () => { /* no-op */ },
        });
    }
}
