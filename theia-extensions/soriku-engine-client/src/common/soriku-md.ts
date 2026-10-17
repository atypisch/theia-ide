/********************************************************************************
 * Soriku IDE — default soriku.md template + trust hash (pure)
 *
 * SPDX-License-Identifier: MIT
 ********************************************************************************/

import { StackInfo } from './stack-detect';

/** File names the IDE recognises as project instructions, in priority order. */
export const INSTRUCTION_FILES = ['soriku.md', '.soriku.md', 'SORIKU.md', 'AGENTS.md', 'CLAUDE.md'] as const;
/** Cap for what is sent with a request. */
export const MAX_INSTRUCTION_CHARS = 8000;

const MISSING = '(not detected — add the command here)';

/** The soriku.md the IDE creates when a project has none: basic rules that improve agent output. */
export function renderSorikuMd(info: StackInfo, projectName = 'this project'): string {
    const detected = info.stack.length > 0 ? ` (detected: ${info.stack.join(', ')})` : '';
    return `# soriku.md — project instructions for Soriku agents

## Project
${projectName}${detected}. Replace this line with one paragraph on what the project is and how it is organised.

## Commands
- Install: ${info.install ?? MISSING}
- Test: ${info.test ?? MISSING}
- Lint/typecheck: ${info.lint ?? MISSING}
- Run: ${info.run ?? MISSING}

## How to work in this repo
- Read the relevant files before changing them; never guess file contents.
- Make small, focused changes: one file per step; prefer apply_patch over rewriting whole files.
- After every change run the Test command (or the narrowest relevant test) and fix failures before moving on.
- Follow the existing style, naming and structure of surrounding code; do not reformat unrelated code.
- Write complete, working code — no placeholders, TODOs or "rest stays the same".
- When a task touches several files, list the files in the plan first, then do them one by one.
- If something is ambiguous, state the assumption in your answer instead of inventing requirements.

## Boundaries
- Never read, print or write secrets (.env*, *.pem, *.key, tokens). Use placeholders like <token>.
- Do not add dependencies, CI workflows, editor tasks, git hooks or network calls without asking.
- Do not modify .github/, .vscode/, .cursor/, .claude/ or this file unless explicitly asked.
- Never run git push, publish, or commands that send data off this machine.

## Definition of done
- Tests pass, lint is clean, and the answer lists changed files and how it was verified.
`;
}

/** SHA-256 hex of the text — the "trust on first use" fingerprint of an instructions file. */
export async function hashText(text: string): Promise<string> {
    const bytes = new TextEncoder().encode(text);
    const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes);
    return Array.from(new Uint8Array(digest)).map(b => b.toString(16).padStart(2, '0')).join('');
}

export interface FoundInstructions {
    name: string;
    content: string;
}

/**
 * Combines the found files into the one block sent to the engine: soriku.md first, then the
 * fallbacks, each under its file name, capped. `files` is in INSTRUCTION_FILES order.
 */
export function combineInstructions(files: FoundInstructions[], max = MAX_INSTRUCTION_CHARS): string {
    const parts = files.filter(f => f.content.trim()).map(f => `# From ${f.name}\n${f.content.trim()}`);
    const text = parts.join('\n\n');
    return text.length > max ? `${text.slice(0, max).trimEnd()}\n…(truncated)` : text;
}

/** Heuristic injection signals for a changed instructions file; shown in the review banner. */
export function suspiciousInstructionSignals(text: string): string[] {
    const checks: Array<[RegExp, string]> = [
        [/ignore (all )?(previous|prior|above) (instructions|rules)/i, 'asks to ignore earlier rules'],
        [/\b(curl|wget)\b[^\n]*(\||https?:\/\/\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})/i, 'downloads or posts to a raw IP / pipes to a shell'],
        [/\b(send|upload|post|exfiltrate|forward)\b[^\n]{0,60}\b(secrets?|tokens?|credentials?|\.env|api[ _-]?keys?|passwords?)\b/i, 'asks to send secrets'],
        [/\bgit push\b[^\n]{0,40}--force|\bchmod 777\b|\brm -rf\s+[/~]/i, 'dangerous command'],
        [/(runOn|folderOpen|postinstall)[^\n]{0,40}(curl|wget|node )/i, 'auto-running script'],
    ];
    return checks.filter(([re]) => re.test(text)).map(([, label]) => label);
}

export interface ApprovedInstructions {
    hash: string;
    text: string;
}

/** `none` = no instruction files; `active` = the user approved exactly this text; `review` = new or changed since approval. */
export type InstructionsStatus = 'none' | 'active' | 'review';

export interface InstructionsDecision {
    status: InstructionsStatus;
    /** What may be sent to the engine right now: the current text when approved, else the LAST approved text (if any). */
    textForRequest: string | undefined;
}

/**
 * Trust on first use. A project file that the user has not approved in this exact form
 * (a fresh clone, a pull that changed it) could carry prompt-injection, so it is NOT sent
 * until approved; the previously approved text keeps being used meanwhile.
 */
export function decideInstructions(currentText: string, currentHash: string, approved: ApprovedInstructions | undefined): InstructionsDecision {
    if (!currentText.trim()) { return { status: 'none', textForRequest: approved?.text }; }
    if (approved && approved.hash === currentHash) { return { status: 'active', textForRequest: currentText }; }
    return { status: 'review', textForRequest: approved?.text };
}
