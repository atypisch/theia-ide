/********************************************************************************
 * Soriku IDE — display title for a stored conversation (pure)
 *
 * SPDX-License-Identifier: MIT
 ********************************************************************************/

/**
 * The engine derives a conversation's title from the first prompt it received. For IDE chats that
 * is the `Workspace: /path` line the IDE prepends (optionally behind a `[Pilot]`-style tag), which
 * says nothing about the conversation — show a neutral label instead.
 */
export function conversationTitle(title: string | undefined): string {
    const t = (title ?? '').replace(/^\s*\[[^\]]{1,20}\]\s*/, '').trim();
    return !t || /^workspace:/i.test(t) ? 'Untitled chat' : t;
}
