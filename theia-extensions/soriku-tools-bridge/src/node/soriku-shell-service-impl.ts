/********************************************************************************
 * Soriku IDE — shell/search backend service (real Node process, not the renderer)
 *
 * SPDX-License-Identifier: MIT
 ********************************************************************************/

import { ChildProcess, execFile, spawn } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs/promises';
import * as path from 'path';
import { injectable } from '@theia/core/shared/inversify';
import { rgPath } from '@vscode/ripgrep';
import {
    RipgrepHit, ShellExecOptions, ShellExecResult, ShellJobStatus, SorikuShellService, TreeEntry,
    checkShellCommand, clampTimeoutMs,
} from '../common/shell-service';

const execFileAsync = promisify(execFile);

const OUTPUT_CAP_BYTES = 512 * 1024;
const JOB_RING_BUFFER_BYTES = 256 * 1024;
const JOB_REAP_AFTER_MS = 10 * 60 * 1000;
const MAX_CONCURRENT_JOBS = 8;

const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', 'lib', '__pycache__', '.venv']);

interface Job {
    proc: ChildProcess;
    buffer: string;
    truncatedBytes: number;
    /**
     * Two-state completion tracking, NOT `exitCode === null` — Node's
     * `close` event reports `code=null` when a process was killed by a
     * SIGNAL (e.g. our own SIGTERM/SIGKILL on stop/timeout), which would
     * otherwise be indistinguishable from "still running". `finished`
     * is the single source of truth for that.
     */
    finished: boolean;
    exitCode: number | null;
    finishedAt?: number;
}

function capString(text: string, capBytes: number): string {
    return Buffer.byteLength(text, 'utf8') > capBytes ? text.slice(0, capBytes) : text;
}

@injectable()
export class SorikuShellServiceImpl implements SorikuShellService {

    protected readonly jobs = new Map<string, Job>();
    protected nextJobId = 1;

    async exec(options: ShellExecOptions): Promise<ShellExecResult> {
        const check = checkShellCommand(options.command);
        const timeoutMs = clampTimeoutMs(options.timeoutMs);
        if (!check.ok || !check.argv) {
            return { stdout: '', stderr: check.reason ?? 'Invalid command', exitCode: null, timedOut: false };
        }
        const [bin, ...args] = check.argv;
        return new Promise<ShellExecResult>(resolve => {
            const proc = spawn(bin, args, { cwd: options.cwd, shell: false });
            let stdout = '';
            let stderr = '';
            let timedOut = false;
            let settled = false;
            const finish = (result: ShellExecResult): void => {
                if (!settled) {
                    settled = true;
                    clearTimeout(killTimer);
                    resolve(result);
                }
            };
            const killTimer = setTimeout(() => {
                timedOut = true;
                proc.kill('SIGTERM');
                setTimeout(() => { if (!proc.killed) { proc.kill('SIGKILL'); } }, 3000);
            }, timeoutMs);
            proc.stdout?.on('data', chunk => { stdout = capString(stdout + chunk.toString(), OUTPUT_CAP_BYTES); });
            proc.stderr?.on('data', chunk => { stderr = capString(stderr + chunk.toString(), OUTPUT_CAP_BYTES); });
            proc.on('error', err => finish({ stdout, stderr: stderr || err.message, exitCode: null, timedOut }));
            proc.on('close', code => finish({ stdout, stderr, exitCode: timedOut ? null : code, timedOut }));
        });
    }

    async startJob(options: ShellExecOptions): Promise<{ jobId: string }> {
        this.reapFinishedJobs();
        if (this.jobs.size >= MAX_CONCURRENT_JOBS) {
            throw new Error(`Too many background jobs running (max ${MAX_CONCURRENT_JOBS}) — stop one first.`);
        }
        const check = checkShellCommand(options.command);
        if (!check.ok || !check.argv) {
            throw new Error(check.reason ?? 'Invalid command');
        }
        const [bin, ...args] = check.argv;
        const proc = spawn(bin, args, { cwd: options.cwd, shell: false });
        const jobId = `job-${this.nextJobId++}`;
        const job: Job = { proc, buffer: '', truncatedBytes: 0, finished: false, exitCode: null };
        this.jobs.set(jobId, job);
        const append = (chunk: Buffer): void => {
            job.buffer = capString(job.buffer + chunk.toString(), JOB_RING_BUFFER_BYTES);
        };
        proc.stdout?.on('data', append);
        proc.stderr?.on('data', append);
        proc.on('close', code => {
            job.finished = true;
            job.exitCode = code;
            job.finishedAt = Date.now();
        });
        proc.on('error', err => {
            job.buffer += `\n[error] ${err.message}`;
            job.finished = true;
            job.exitCode = -1;
            job.finishedAt = Date.now();
        });
        return { jobId };
    }

    async pollJob(jobId: string, sinceOffset = 0): Promise<ShellJobStatus> {
        const job = this.jobs.get(jobId);
        if (!job) {
            return { jobId, running: false, exitCode: null, output: '', outputOffset: sinceOffset };
        }
        const output = job.buffer.slice(sinceOffset);
        return {
            jobId,
            running: !job.finished,
            exitCode: job.exitCode,
            output,
            outputOffset: job.buffer.length,
        };
    }

    async stopJob(jobId: string): Promise<boolean> {
        const job = this.jobs.get(jobId);
        if (!job || job.finished) {
            return false;
        }
        job.proc.kill('SIGTERM');
        setTimeout(() => { if (!job.proc.killed) { job.proc.kill('SIGKILL'); } }, 3000);
        return true;
    }

    protected reapFinishedJobs(): void {
        const now = Date.now();
        for (const [id, job] of this.jobs) {
            if (job.finishedAt && now - job.finishedAt > JOB_REAP_AFTER_MS) {
                this.jobs.delete(id);
            }
        }
    }

    async search(pattern: string, baseDir: string, maxHits = 50): Promise<RipgrepHit[]> {
        if (!pattern.trim()) {
            return [];
        }
        try {
            const { stdout } = await execFileAsync(rgPath, [
                '--line-number', '--no-heading', '--max-count', String(maxHits),
                '--glob', '!node_modules', '--glob', '!.git',
                pattern, baseDir,
            ], { timeout: 15000, maxBuffer: OUTPUT_CAP_BYTES });
            const hits: RipgrepHit[] = [];
            for (const line of stdout.split('\n')) {
                if (!line) {
                    continue;
                }
                const m = /^(.+?):(\d+):(.*)$/.exec(line);
                if (m) {
                    hits.push({ path: m[1], line: parseInt(m[2], 10), text: m[3].trim().slice(0, 200) });
                }
            }
            return hits;
        } catch {
            return [];
        }
    }

    async listTree(baseDir: string, maxEntries = 200): Promise<TreeEntry[]> {
        const entries: TreeEntry[] = [];
        const queue: { dir: string; depth: number }[] = [{ dir: baseDir, depth: 0 }];
        while (queue.length > 0 && entries.length < maxEntries) {
            const { dir, depth } = queue.shift()!;
            if (depth > 4) {
                continue;
            }
            let children;
            try {
                children = await fs.readdir(dir, { withFileTypes: true });
            } catch {
                continue;
            }
            for (const child of children) {
                if (entries.length >= maxEntries) {
                    break;
                }
                if (SKIP_DIRS.has(child.name)) {
                    continue;
                }
                const full = path.join(dir, child.name);
                const rel = path.relative(baseDir, full) || child.name;
                entries.push({ path: rel, isDirectory: child.isDirectory() });
                if (child.isDirectory()) {
                    queue.push({ dir: full, depth: depth + 1 });
                }
            }
        }
        return entries;
    }
}
