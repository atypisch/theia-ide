/********************************************************************************
 * Soriku IDE — tool-autonomy preferences
 *
 * Controls how much a chat agent can do without stopping to ask: whether
 * file edits apply immediately, how aggressively other tool calls
 * auto-approve, and how long an unanswered approval waits before it
 * auto-denies (0 = never, for long unattended autonomous runs).
 *
 * SPDX-License-Identifier: MIT
 ********************************************************************************/

import { PreferenceSchema, PreferenceScope } from '@theia/core';

export const SORIKU_AUTO_APPLY_EDITS = 'soriku.tools.autoApplyEdits';
export const SORIKU_AUTO_APPROVE = 'soriku.tools.autoApprove';
export const SORIKU_APPROVAL_TIMEOUT_SECONDS = 'soriku.tools.approvalTimeoutSeconds';
export const SORIKU_PLAN_MCP = 'soriku.tools.planMcp';

/** 'off' asks for every destructive tool call; 'safe' auto-approves everything except
 *  dangerous shell commands; 'all' auto-approves everything (YOLO). */
export type AutoApproveLevel = 'off' | 'safe' | 'all';

export const DEFAULT_AUTO_APPLY_EDITS = true;
export const DEFAULT_AUTO_APPROVE: AutoApproveLevel = 'off';
export const DEFAULT_APPROVAL_TIMEOUT_SECONDS = 120;
// Off by default — MCP tools can reach outside the host (arbitrary connected
// servers), so autonomous plan workers only get them once the user opts in.
export const DEFAULT_PLAN_MCP = false;

export const sorikuToolsPreferenceSchema: PreferenceSchema = {
    properties: {
        [SORIKU_AUTO_APPLY_EDITS]: {
            type: 'boolean',
            description: 'Apply agent-proposed file edits immediately. The diff still opens for '
                + 'visual review, but nothing blocks on Accept/Reject — off restores the manual '
                + 'Accept/Reject prompt for every write.',
            default: DEFAULT_AUTO_APPLY_EDITS,
            scope: PreferenceScope.User,
        },
        [SORIKU_AUTO_APPROVE]: {
            type: 'string',
            enum: ['off', 'safe', 'all'],
            description: '"off": ask before every destructive tool call. "safe": auto-approve '
                + 'everything except dangerous shell commands (rm, sudo, git push/reset --hard, '
                + 'chmod -R, …), which still ask. "all": auto-approve everything, including '
                + 'dangerous shell commands — full autonomy, no safety net.',
            default: DEFAULT_AUTO_APPROVE,
            scope: PreferenceScope.User,
        },
        [SORIKU_APPROVAL_TIMEOUT_SECONDS]: {
            type: 'number',
            description: 'Auto-deny an unanswered tool approval after this many seconds. '
                + 'Set to 0 to never auto-deny — needed for a long unattended autonomous run '
                + 'where nobody is watching the chat panel.',
            default: DEFAULT_APPROVAL_TIMEOUT_SECONDS,
            minimum: 0,
            scope: PreferenceScope.User,
        },
        [SORIKU_PLAN_MCP]: {
            type: 'boolean',
            description: 'Let Plan-mode workers use connected MCP tools. Off by default — MCP '
                + 'servers can reach outside this machine, so autonomous plan workers only get '
                + 'them once you opt in here.',
            default: DEFAULT_PLAN_MCP,
            scope: PreferenceScope.User,
        },
    },
};
