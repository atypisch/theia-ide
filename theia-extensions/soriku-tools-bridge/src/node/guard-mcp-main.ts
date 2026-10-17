/********************************************************************************
 * Soriku IDE — `soriku-guard` MCP server entry point (stdio).
 *
 *   node lib/node/guard-mcp-main.js --root /path/to/workspace
 *
 * SPDX-License-Identifier: MIT
 ********************************************************************************/

import * as fs from 'fs';
import * as path from 'path';
import * as readline from 'readline';
import { handleMessage, parseLine } from './guard-mcp-server';

function realpath(p: string): string | undefined {
    let current = path.resolve(p);
    const tail: string[] = [];
    for (;;) {
        try {
            const real = fs.realpathSync(current);
            return tail.length > 0 ? path.join(real, ...tail.reverse()) : real;
        } catch {
            const parent = path.dirname(current);
            if (parent === current) { return undefined; }
            tail.push(path.basename(current));
            current = parent;
        }
    }
}

function main(): void {
    const rootIndex = process.argv.indexOf('--root');
    const root = rootIndex >= 0 && process.argv[rootIndex + 1] ? path.resolve(process.argv[rootIndex + 1]) : process.cwd();
    const ctx = { workspaceRoot: root, realpath };
    const rl = readline.createInterface({ input: process.stdin });
    rl.on('line', line => {
        const { request, error } = parseLine(line);
        const response = error ?? (request ? handleMessage(request, ctx) : undefined);
        if (response) {
            process.stdout.write(`${JSON.stringify(response)}\n`);
        }
    });
    rl.on('close', () => process.exit(0));
}

main();
