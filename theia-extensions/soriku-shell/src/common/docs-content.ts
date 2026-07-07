/********************************************************************************
 * Soriku IDE — offline documentation content for the in-app Documentation
 * overlay, 1:1 from the mockup's docs pages (getting-started/agents/
 * routing/shortcuts). Static text, shared source of truth with soriku.com/docs.
 *
 * SPDX-License-Identifier: MIT
 ********************************************************************************/

export type DocBlock =
    | { kind: 'h'; text: string }
    | { kind: 'h2'; text: string }
    | { kind: 'p'; text: string }
    | { kind: 'code'; text: string };

export interface DocPage {
    slug: string;
    label: string;
    blocks: ReadonlyArray<DocBlock>;
}

export const DOC_PAGES: ReadonlyArray<DocPage> = [
    {
        slug: 'getting-started',
        label: 'Getting started',
        blocks: [
            { kind: 'h', text: 'Welcome to Soriku Code' },
            { kind: 'p', text: 'Soriku is a local-first AI IDE. Every prompt runs on your machine unless you explicitly opt in to a capped cloud call.' },
            { kind: 'h2', text: 'The three pickers' },
            {
                kind: 'p', text: 'Every message is shaped by Do (behaviour), Model (single / ensemble) and Route ' +
                    '(local-first / hybrid / best). The router classifies your prompt and picks the strongest model from the capability map.'
            },
            { kind: 'code', text: 'soriku engine start   # http://127.0.0.1:8765' },
            { kind: 'h2', text: 'Working with a fleet' },
            {
                kind: 'p', text: 'Complex work is decomposed by the Master Planner into a plan of tasks, each assigned to an agent and the ' +
                    'cheapest capable model. Subagents (minions) can be spawned on the fly to verify or specialise.'
            },
        ],
    },
    {
        slug: 'agents',
        label: 'Agents & subagents',
        blocks: [
            { kind: 'h', text: 'Agents' },
            { kind: 'p', text: 'Agents are persistent personas with memory, tone and a specialism. They are not raw models — they work as a team.' },
            { kind: 'h2', text: 'Subagents' },
            { kind: 'p', text: 'A worker can spawn a subagent (minion) for a narrow job. If the engine flags a subagent as having potential, you can promote it to a full agent.' },
            { kind: 'p', text: 'Potential is decided by the engine, not the IDE, from transparent thresholds such as reuse count and positive-feedback ratio.' },
        ],
    },
    {
        slug: 'routing',
        label: 'Routing & models',
        blocks: [
            { kind: 'h', text: 'Local-first routing' },
            {
                kind: 'p', text: 'The router prefers a warm local model when it clears the quality threshold for the task category, ' +
                    'and only falls back to remote when nothing local qualifies.'
            },
            { kind: 'h2', text: 'Overrides' },
            { kind: 'p', text: 'Force a model per category on the Routing page, or leave it on Auto to follow the capability map.' },
        ],
    },
    {
        slug: 'shortcuts',
        label: 'Keyboard & commands',
        blocks: [
            { kind: 'h', text: 'Command palette' },
            { kind: 'p', text: 'Press ⌘K to jump to any view or run a command. See Keyboard Shortcuts for the full list.' },
        ],
    },
];
