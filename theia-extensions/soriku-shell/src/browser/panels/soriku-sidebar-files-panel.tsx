/********************************************************************************
 * Soriku IDE — Explorer context panel: a real, always-visible FILES tree
 * rendered directly from FileNavigatorModel/DecorationsService (the same
 * singleton model the stock Explorer view uses, fetched headless via
 * WidgetManager.getOrCreateWidget — the real FileNavigatorWidget is never
 * attached to the shell, only its model/decorations are read). Reparenting
 * the actual Lumino widget was ruled out as too fragile; this reads the
 * same live data instead.
 *
 * SPDX-License-Identifier: MIT
 ********************************************************************************/

import * as React from '@theia/core/shared/react';
import URI from '@theia/core/lib/common/uri';
import { TreeNode, CompositeTreeNode, ExpandableTreeNode, SelectableTreeNode } from '@theia/core/lib/browser/tree';
import { DecorationsService } from '@theia/core/lib/browser/decorations-service';
import { CommandService } from '@theia/core/lib/common/command';
import { FileNavigatorModel } from '@theia/navigator/lib/browser/navigator-model';
import { FileStatNode } from '@theia/filesystem/lib/browser/file-tree';
import { SorikuGeneratedFilesTracker } from 'soriku-tools-bridge-ext/lib/browser/soriku-generated-files-tracker';
import { SorikuEditorRevealService } from 'soriku-tools-bridge-ext/lib/browser/soriku-editor-reveal-service';

export interface SorikuSidebarFilesPanelProps {
    model: FileNavigatorModel;
    decorations: DecorationsService;
    commands: CommandService;
    generatedFiles: SorikuGeneratedFilesTracker;
    editorReveal: SorikuEditorRevealService;
}

function fileName(path: string): string {
    return path.split(/[\\/]/).pop() ?? path;
}

function colorVar(colorId: string): string {
    return `var(--theia-${colorId.replace(/\./g, '-')})`;
}

export function SorikuSidebarFilesPanel({ model, decorations, commands, generatedFiles, editorReveal }: SorikuSidebarFilesPanelProps): React.ReactElement {
    const [, forceUpdate] = React.useState(0);

    React.useEffect(() => {
        const toDispose = [
            model.onChanged(() => forceUpdate(n => n + 1)),
            model.onExpansionChanged(() => forceUpdate(n => n + 1)),
            model.onSelectionChanged(() => forceUpdate(n => n + 1)),
            decorations.onDidChangeDecorations(() => forceUpdate(n => n + 1)),
            generatedFiles.onDidChange(() => forceUpdate(n => n + 1)),
        ];
        return () => toDispose.forEach(d => d.dispose());
    }, [model, decorations, generatedFiles]);

    const renderNode = (node: TreeNode, depth: number): React.ReactNode => {
        const isDir = FileStatNode.is(node) && node.fileStat.isDirectory;
        const expanded = ExpandableTreeNode.is(node) && node.expanded;
        const selected = SelectableTreeNode.is(node) && node.selected;
        const uriString = FileStatNode.getUri(node);
        const decoration = uriString ? decorations.getDecoration(new URI(uriString), false)[0] : undefined;
        const label = uriString ? new URI(uriString).path.base : node.id;

        return (
            <React.Fragment key={node.id}>
                <div
                    className={`soriku-sidebar-files-row${selected ? ' active' : ''}`}
                    style={{ paddingLeft: 8 + depth * 14 }}
                    onClick={() => {
                        model.selectNode(node as SelectableTreeNode);
                        if (isDir && ExpandableTreeNode.is(node)) {
                            model.toggleNodeExpansion(node);
                        } else {
                            model.openNode(node);
                        }
                    }}
                >
                    <span className={`codicon ${isDir ? (expanded ? 'codicon-chevron-down' : 'codicon-chevron-right') : 'codicon-file'} soriku-sidebar-files-icon`} />
                    <span
                        className="soriku-sidebar-files-label"
                        style={decoration?.colorId ? { color: colorVar(decoration.colorId) } : undefined}
                        title={decoration?.tooltip}
                    >
                        {label}
                    </span>
                    {decoration?.letter && (
                        <span
                            className="soriku-sidebar-files-status"
                            style={decoration.colorId ? { color: colorVar(decoration.colorId) } : undefined}
                        >
                            {decoration.letter}
                        </span>
                    )}
                </div>
                {isDir && expanded && CompositeTreeNode.is(node) && node.children.map(child => renderNode(child, depth + 1))}
            </React.Fragment>
        );
    };

    const root = model.root;

    return (
        <div className="soriku-sidebar-files-panel">
            <div className="soriku-sidebar-files-header">
                <span className="soriku-sidebar-files-eyebrow">Files</span>
                <div className="soriku-sidebar-files-header-actions">
                    <button
                        className="soriku-sidebar-files-header-btn"
                        title="New File…"
                        onClick={() => commands.executeCommand('soriku.overlay.newFile')}
                    >
                        <span className="codicon codicon-new-file" />
                    </button>
                    <button
                        className="soriku-sidebar-files-header-btn"
                        title="Collapse all"
                        disabled={!root || !CompositeTreeNode.is(root)}
                        onClick={() => root && CompositeTreeNode.is(root) && model.collapseAll(root)}
                    >
                        <span className="codicon codicon-collapse-all" />
                    </button>
                </div>
            </div>
            {!root || !CompositeTreeNode.is(root)
                ? <div className="soriku-sidebar-files-empty">No workspace open.</div>
                : root.children.map(child => renderNode(child, 0))}
            {generatedFiles.entries().length > 0 && (
                <>
                    <div className="soriku-sidebar-generated-eyebrow">
                        <span className="soriku-sidebar-generated-dot" />
                        Generated · run
                    </div>
                    {generatedFiles.entries().map(([path, diff]) => (
                        <div
                            key={path}
                            className="soriku-sidebar-generated-row"
                            title={path}
                            onClick={() => { editorReveal.resetDedup(); editorReveal.revealPath(path).catch(() => { /* ignore */ }); }}
                        >
                            <span className="codicon codicon-new-file soriku-sidebar-generated-icon" />
                            <span className="soriku-sidebar-generated-name">{fileName(path)}</span>
                            <span className="soriku-sidebar-generated-diff">
                                {diff.added > 0 && `+${diff.added}`}{diff.added > 0 && diff.removed > 0 && ' '}{diff.removed > 0 && `-${diff.removed}`}
                            </span>
                        </div>
                    ))}
                </>
            )}
        </div>
    );
}
