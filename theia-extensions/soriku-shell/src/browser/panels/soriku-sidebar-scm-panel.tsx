/********************************************************************************
 * Soriku IDE — Source Control context panel: commit textarea + staged/
 * unstaged resource groups, reading directly from the real ScmService/
 * ScmRepository (root-bound singletons, no widget-reparenting needed).
 *
 * "Commit" invokes the provider's own real acceptInputCommand (the same
 * mechanism Theia's stock SCM view uses, see scm-contribution.ts's
 * acceptInput()) — no custom commit logic. If a repository has no
 * acceptInputCommand, the button is simply omitted rather than wired to
 * nothing.
 *
 * SPDX-License-Identifier: MIT
 ********************************************************************************/

import * as React from '@theia/core/shared/react';
import { CommandService } from '@theia/core/lib/common/command';
import { ScmRepository } from '@theia/scm/lib/browser/scm-repository';
import { Btn } from 'soriku-theme-ext/lib/browser/ui';

export interface SorikuSidebarScmPanelProps {
    repository: ScmRepository | undefined;
    commands: CommandService;
}

export function SorikuSidebarScmPanel({ repository, commands }: SorikuSidebarScmPanelProps): React.ReactElement {
    const [, forceUpdate] = React.useState(0);

    React.useEffect(() => {
        if (!repository) {
            return undefined;
        }
        const toDispose = [
            repository.provider.onDidChange(() => forceUpdate(n => n + 1)),
            repository.input.onDidChange(() => forceUpdate(n => n + 1)),
        ];
        return () => toDispose.forEach(d => d.dispose());
    }, [repository]);

    if (!repository) {
        return <div className="soriku-sidebar-scm-empty">No source control repository in this workspace.</div>;
    }

    const acceptCommand = repository.provider.acceptInputCommand;
    const commit = async (): Promise<void> => {
        if (acceptCommand?.command) {
            await commands.executeCommand(acceptCommand.command, ...(acceptCommand.arguments ?? []));
        }
    };

    return (
        <div className="soriku-sidebar-scm-panel">
            <textarea
                className="soriku-sidebar-scm-input"
                placeholder={repository.input.placeholder ?? 'Message'}
                value={repository.input.value ?? ''}
                onChange={e => { repository.input.value = e.target.value; }}
            />
            {acceptCommand && (
                <Btn onClick={commit}>{acceptCommand.title || 'Commit'}</Btn>
            )}
            {repository.provider.groups.map(group => group.resources.length > 0 && (
                <div className="soriku-sidebar-scm-group" key={group.id}>
                    <div className="soriku-sidebar-scm-group-label">{group.label}</div>
                    {group.resources.map(resource => (
                        <div
                            className="soriku-sidebar-scm-resource"
                            key={resource.sourceUri.toString()}
                            onClick={() => resource.open()}
                        >
                            <span className="soriku-sidebar-scm-resource-name">{resource.sourceUri.path.base}</span>
                            {resource.decorations?.letter && (
                                <span
                                    className="soriku-sidebar-scm-resource-letter"
                                    style={resource.decorations.color ? { color: resource.decorations.color } : undefined}
                                >
                                    {resource.decorations.letter}
                                </span>
                            )}
                        </div>
                    ))}
                </div>
            ))}
        </div>
    );
}
