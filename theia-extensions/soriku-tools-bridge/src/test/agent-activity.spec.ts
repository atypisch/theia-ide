import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { extractWriteActivity, shouldRevealWrite } from '../common/agent-activity';

describe('agent-activity', () => {
    it('extracts file_write activity', () => {
        const activity = extractWriteActivity({
            type: 'worker_tool_call',
            tool: 'file_write',
            args: { path: '/tmp/foo.php', content: "line1\nline2\n" },
        });
        assert.equal(activity?.path, '/tmp/foo.php');
        assert.equal(activity?.size, 3);
        assert.match(activity?.preview ?? '', /line1/);
    });

    it('should reveal successful writes only', () => {
        assert.equal(shouldRevealWrite({
            type: 'worker_tool_call',
            tool: 'file_write',
            args: { path: 'a.py', content: 'x' },
        }), true);
        assert.equal(shouldRevealWrite({
            type: 'worker_tool_call',
            tool: 'file_write',
            args: { path: 'a.py' },
            error: 'blocked',
        }), false);
    });
});
