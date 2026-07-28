/********************************************************************************
 * Soriku IDE — backend shell/search service unit tests
 *
 * These run real subprocesses (echo/python3/ripgrep) — the whole point of
 * this service is real OS interaction, so a mock would test nothing.
 *
 * SPDX-License-Identifier: MIT
 ********************************************************************************/

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
    checkShellCommand, formatShellResult, formatTree, splitShellCommand,
} from '../common/shell-service';
import { SorikuShellServiceImpl } from '../node/soriku-shell-service-impl';

function tmpDir(prefix: string): string {
    return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

describe('splitShellCommand / checkShellCommand', () => {
    it('splits plain whitespace-separated args', () => {
        assert.deepEqual(splitShellCommand('echo hello world'), ['echo', 'hello', 'world']);
    });
    it('respects single and double quotes', () => {
        assert.deepEqual(splitShellCommand('echo "hello world" \'a b\''), ['echo', 'hello world', 'a b']);
    });
    it('allows an allowlisted command', () => {
        const check = checkShellCommand('pytest -q');
        assert.equal(check.ok, true);
        assert.deepEqual(check.argv, ['pytest', '-q']);
    });
    it('blocks a non-allowlisted command', () => {
        const check = checkShellCommand('rm -rf /');
        assert.equal(check.ok, false);
        assert.match(check.reason ?? '', /BLOCKED: command 'rm'/);
    });
    it('rejects an empty command', () => {
        assert.equal(checkShellCommand('   ').ok, false);
    });
});

describe('formatShellResult', () => {
    it('mirrors the engine shape: stdout, stderr block, exit code, trimmed', () => {
        const out = formatShellResult({ stdout: 'hi\n', stderr: 'warn\n', exitCode: 1, timedOut: false }, 30);
        assert.equal(out, 'hi\n\n[stderr]\nwarn\n\n[exit code: 1]');
    });
    it('omits the exit-code marker on success', () => {
        const out = formatShellResult({ stdout: 'ok', stderr: '', exitCode: 0, timedOut: false }, 30);
        assert.equal(out, 'ok');
    });
    it('reports "(no output)" for an empty successful result', () => {
        const out = formatShellResult({ stdout: '', stderr: '', exitCode: 0, timedOut: false }, 30);
        assert.equal(out, '(no output)');
    });
    it('reports TIMEOUT with the configured seconds', () => {
        const out = formatShellResult({ stdout: '', stderr: '', exitCode: null, timedOut: true }, 12);
        assert.equal(out, 'TIMEOUT: command exceeded 12s');
    });
    it('truncates long output with a trailing marker', () => {
        const out = formatShellResult({ stdout: 'x'.repeat(50), stderr: '', exitCode: 0, timedOut: false }, 30, 10);
        assert.equal(out, 'x'.repeat(10) + '\n[... truncated]');
    });
});

describe('formatTree', () => {
    it('reports "(empty)" for no entries', () => {
        assert.equal(formatTree([]), '(empty)');
    });
    it('renders top-level entries with a trailing slash on directories', () => {
        const out = formatTree([
            { path: 'src', isDirectory: true },
            { path: 'README.md', isDirectory: false },
        ]);
        assert.equal(out, 'src/\nREADME.md');
    });
    it('indents nested entries by path depth', () => {
        const out = formatTree([
            { path: 'src', isDirectory: true },
            { path: 'src/index.ts', isDirectory: false },
            { path: 'src/util', isDirectory: true },
            { path: 'src/util/helpers.ts', isDirectory: false },
        ]);
        assert.equal(out, 'src/\n  index.ts\n  util/\n    helpers.ts');
    });
    it('handles Windows-style separators the same as posix', () => {
        const out = formatTree([{ path: 'src\\index.ts', isDirectory: false }]);
        assert.equal(out, '  index.ts');
    });
});

describe('SorikuShellServiceImpl.exec', () => {
    it('captures stdout of an allowlisted command', async () => {
        const svc = new SorikuShellServiceImpl();
        const result = await svc.exec({ command: 'echo hello-soriku', cwd: process.cwd() });
        assert.match(result.stdout, /hello-soriku/);
        assert.equal(result.exitCode, 0);
        assert.equal(result.timedOut, false);
    });

    it('reports a non-zero exit code without throwing', async () => {
        const svc = new SorikuShellServiceImpl();
        const result = await svc.exec({ command: 'python3 -c "import sys; sys.exit(3)"', cwd: process.cwd() });
        assert.equal(result.exitCode, 3);
        assert.equal(result.timedOut, false);
    });

    it('blocks a non-allowlisted command instead of running it', async () => {
        const svc = new SorikuShellServiceImpl();
        const result = await svc.exec({ command: 'curl https://example.com', cwd: process.cwd() });
        assert.equal(result.exitCode, null);
        assert.match(result.stderr, /BLOCKED/);
    });

    it('kills the process and sets timedOut on a slow command', async () => {
        const svc = new SorikuShellServiceImpl();
        const result = await svc.exec({
            command: 'python3 -c "import time; time.sleep(5)"',
            cwd: process.cwd(),
            timeoutMs: 300,
        });
        assert.equal(result.timedOut, true);
    });
});

describe('SorikuShellServiceImpl background jobs', () => {
    it('starts a job, polls incremental output, and stops it', async () => {
        const svc = new SorikuShellServiceImpl();
        const { jobId } = await svc.startJob({
            command: 'python3 -c "import time,sys\nfor i in range(20): print(i); sys.stdout.flush(); time.sleep(0.05)"',
            cwd: process.cwd(),
        });
        assert.ok(jobId);

        await new Promise(resolve => setTimeout(resolve, 200));
        const status = await svc.pollJob(jobId);
        assert.equal(status.running, true);
        assert.match(status.output, /0/);

        const stopped = await svc.stopJob(jobId);
        assert.equal(stopped, true);

        // SIGTERM latency varies with host load; poll instead of a fixed sleep
        // (mirrors how a real caller would wait for a job to actually stop).
        let afterStop = await svc.pollJob(jobId);
        for (let attempt = 0; attempt < 20 && afterStop.running; attempt++) {
            await new Promise(resolve => setTimeout(resolve, 200));
            afterStop = await svc.pollJob(jobId);
        }
        assert.equal(afterStop.running, false);
    });

    it('pollJob on an unknown job reports not running with empty output', async () => {
        const svc = new SorikuShellServiceImpl();
        const status = await svc.pollJob('does-not-exist');
        assert.equal(status.running, false);
        assert.equal(status.output, '');
    });

    it('stopJob on an unknown job returns false', async () => {
        const svc = new SorikuShellServiceImpl();
        assert.equal(await svc.stopJob('does-not-exist'), false);
    });
});

describe('SorikuShellServiceImpl.search', () => {
    it('finds a known string via the bundled ripgrep binary', async () => {
        const dir = tmpDir('soriku-search-');
        fs.writeFileSync(path.join(dir, 'a.txt'), 'hello SORIKU_NEEDLE world\n');
        fs.writeFileSync(path.join(dir, 'b.txt'), 'nothing here\n');
        const svc = new SorikuShellServiceImpl();
        const hits = await svc.search('SORIKU_NEEDLE', dir);
        assert.equal(hits.length, 1);
        assert.match(hits[0].path, /a\.txt$/);
        assert.equal(hits[0].line, 1);
    });

    it('caps the number of hits returned', async () => {
        const dir = tmpDir('soriku-search-cap-');
        const lines = Array.from({ length: 20 }, () => 'SORIKU_NEEDLE').join('\n');
        fs.writeFileSync(path.join(dir, 'many.txt'), lines);
        const svc = new SorikuShellServiceImpl();
        const hits = await svc.search('SORIKU_NEEDLE', dir, 5);
        assert.equal(hits.length, 5);
    });

    it('returns an empty array for a blank query', async () => {
        const svc = new SorikuShellServiceImpl();
        assert.deepEqual(await svc.search('   ', process.cwd()), []);
    });
});

describe('SorikuShellServiceImpl.listTree', () => {
    it('skips node_modules and other noise directories', async () => {
        const dir = tmpDir('soriku-tree-');
        fs.mkdirSync(path.join(dir, 'node_modules', 'pkg'), { recursive: true });
        fs.writeFileSync(path.join(dir, 'node_modules', 'pkg', 'index.js'), '');
        fs.writeFileSync(path.join(dir, 'app.py'), '');
        fs.mkdirSync(path.join(dir, 'src'));
        fs.writeFileSync(path.join(dir, 'src', 'main.py'), '');

        const svc = new SorikuShellServiceImpl();
        const entries = await svc.listTree(dir, 200);
        const paths = entries.map(e => e.path);
        assert.ok(paths.includes('app.py'));
        assert.ok(paths.includes('src'));
        assert.ok(paths.some(p => p.endsWith(path.join('src', 'main.py'))));
        assert.ok(!paths.some(p => p.includes('node_modules')));
    });

    it('caps the number of entries returned', async () => {
        const dir = tmpDir('soriku-tree-cap-');
        for (let i = 0; i < 30; i++) {
            fs.writeFileSync(path.join(dir, `file-${i}.txt`), '');
        }
        const svc = new SorikuShellServiceImpl();
        const entries = await svc.listTree(dir, 10);
        assert.equal(entries.length, 10);
    });
});
