/********************************************************************************
 * Soriku IDE — Find in Files context panel: a query input driving the real
 * SearchInWorkspaceService (root-bound singleton), grouped by file with
 * highlighted match snippets, mirroring the aggregation
 * SearchInWorkspaceResultTreeWidget does internally (that widget isn't
 * reparented here — its own tree/aggregation logic isn't exposed as a
 * reusable service, so this replicates just the grouping, not a new search
 * backend).
 *
 * SPDX-License-Identifier: MIT
 ********************************************************************************/

import * as React from '@theia/core/shared/react';
import URI from '@theia/core/lib/common/uri';
import { open, OpenerService } from '@theia/core/lib/browser/opener-service';
import { SearchInWorkspaceService } from '@theia/search-in-workspace/lib/browser/search-in-workspace-service';
import { SearchInWorkspaceResult, SearchMatch } from '@theia/search-in-workspace/lib/common/search-in-workspace-interface';

export interface SorikuSidebarSearchPanelProps {
    searchService: SearchInWorkspaceService;
    openerService: OpenerService;
}

function matchText(match: SearchMatch): string {
    return typeof match.lineText === 'string' ? match.lineText : match.lineText.text;
}

export function SorikuSidebarSearchPanel({ searchService, openerService }: SorikuSidebarSearchPanelProps): React.ReactElement {
    const [query, setQuery] = React.useState('');
    const [results, setResults] = React.useState<Map<string, SearchInWorkspaceResult>>(new Map());
    const [searching, setSearching] = React.useState(false);
    const searchIdRef = React.useRef<number | undefined>(undefined);

    const runSearch = React.useCallback((value: string) => {
        if (searchIdRef.current !== undefined) {
            searchService.cancel(searchIdRef.current);
            searchIdRef.current = undefined;
        }
        if (!value.trim()) {
            setResults(new Map());
            setSearching(false);
            return;
        }
        const collected = new Map<string, SearchInWorkspaceResult>();
        setSearching(true);
        searchService.search(value, {
            onResult: (searchId, result) => {
                collected.set(result.fileUri, result);
                setResults(new Map(collected));
            },
            onDone: () => setSearching(false),
        }).then(id => { searchIdRef.current = id; });
    }, [searchService]);

    const onChange = (e: React.ChangeEvent<HTMLInputElement>): void => {
        const value = e.target.value;
        setQuery(value);
        runSearch(value);
    };

    const openMatch = (fileUri: string, match: SearchMatch): void => {
        open(openerService, new URI(fileUri), {
            selection: {
                start: { line: match.line - 1, character: match.character - 1 },
                end: { line: match.line - 1, character: match.character - 1 + match.length },
            },
        });
    };

    return (
        <div className="soriku-sidebar-search-panel">
            <span className="soriku-sidebar-search-eyebrow">Find in files</span>
            <input
                className="soriku-sidebar-search-input"
                placeholder="Search"
                value={query}
                onChange={onChange}
            />
            {searching && <div className="soriku-sidebar-search-status">Searching…</div>}
            {!searching && query.trim() && results.size === 0 && (
                <div className="soriku-sidebar-search-status">No results.</div>
            )}
            <div className="soriku-sidebar-search-results">
                {Array.from(results.values()).map(result => {
                    const uri = new URI(result.fileUri);
                    return (
                        <div className="soriku-sidebar-search-file" key={result.fileUri}>
                            <div className="soriku-sidebar-search-file-name">
                                {uri.path.base}
                                <span className="soriku-sidebar-search-match-count">{result.matches.length}</span>
                            </div>
                            {result.matches.map((match, i) => (
                                <div
                                    className="soriku-sidebar-search-match"
                                    key={i}
                                    onClick={() => openMatch(result.fileUri, match)}
                                >
                                    {matchText(match).trim()}
                                </div>
                            ))}
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
