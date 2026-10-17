/********************************************************************************
 * Soriku IDE — stack detection for the default soriku.md (pure)
 *
 * SPDX-License-Identifier: MIT
 ********************************************************************************/

/** Contents of the project files we look at, keyed by file name (missing key = file not present). */
export type ProjectFiles = Partial<Record<
    'package.json' | 'composer.json' | 'pyproject.toml' | 'requirements.txt' | 'Makefile' | 'go.mod' | 'Cargo.toml', string>>;

export interface StackInfo {
    /** Human labels, e.g. ["Node/TypeScript", "Vue"]. */
    stack: string[];
    install?: string;
    test?: string;
    lint?: string;
    run?: string;
}

function parseJson(text: string | undefined): Record<string, unknown> | undefined {
    if (!text) { return undefined; }
    try {
        const v = JSON.parse(text);
        return v && typeof v === 'object' ? v as Record<string, unknown> : undefined;
    } catch {
        return undefined;
    }
}

function has(map: unknown, key: string): boolean {
    return !!map && typeof map === 'object' && key in (map as Record<string, unknown>);
}

/** Picks the first existing script of `names` and returns the runner command for it. */
function script(scripts: Record<string, unknown> | undefined, names: string[], runner: string): string | undefined {
    const found = names.find(n => scripts && typeof scripts[n] === 'string');
    return found ? (found === 'test' && runner === 'npm' ? 'npm test' : `${runner} run ${found}`) : undefined;
}

export function detectStack(files: ProjectFiles): StackInfo {
    const info: StackInfo = { stack: [] };

    const pkg = parseJson(files['package.json']);
    if (pkg) {
        const deps = { ...(pkg.dependencies as object | undefined), ...(pkg.devDependencies as object | undefined) };
        const scripts = pkg.scripts as Record<string, unknown> | undefined;
        info.stack.push(has(deps, 'typescript') ? 'Node/TypeScript' : 'Node');
        for (const [dep, label] of [['vue', 'Vue'], ['react', 'React'], ['next', 'Next.js'], ['svelte', 'Svelte'], ['express', 'Express']] as const) {
            if (has(deps, dep)) { info.stack.push(label); }
        }
        info.install = 'npm install';
        info.test = script(scripts, ['test'], 'npm');
        info.lint = script(scripts, ['lint', 'typecheck', 'check'], 'npm');
        info.run = script(scripts, ['dev', 'start', 'serve'], 'npm');
    }

    const composer = parseJson(files['composer.json']);
    if (composer) {
        info.stack.push('PHP');
        const require = composer.require as Record<string, unknown> | undefined;
        if (has(require, 'laravel/framework')) { info.stack.push('Laravel'); }
        info.install ??= 'composer install';
        const scripts = composer.scripts as Record<string, unknown> | undefined;
        info.test ??= has(scripts, 'test') ? 'composer test' : has(require, 'phpunit/phpunit') ? 'vendor/bin/phpunit' : undefined;
    }

    const py = files['pyproject.toml'] ?? files['requirements.txt'];
    if (py !== undefined) {
        info.stack.push('Python');
        info.install ??= files['requirements.txt'] !== undefined ? 'pip install -r requirements.txt' : 'pip install -e .';
        if (/pytest/i.test(py) || files['requirements.txt'] !== undefined) { info.test ??= 'pytest -q'; }
        if (/\bruff\b/i.test(py)) { info.lint ??= 'ruff check .'; }
    }

    if (files['go.mod'] !== undefined) {
        info.stack.push('Go');
        info.test ??= 'go test ./...';
        info.lint ??= 'go vet ./...';
    }
    if (files['Cargo.toml'] !== undefined) {
        info.stack.push('Rust');
        info.test ??= 'cargo test';
        info.lint ??= 'cargo clippy';
    }

    const make = files['Makefile'];
    if (make !== undefined) {
        if (/^test\s*:/m.test(make)) { info.test ??= 'make test'; }
        if (/^lint\s*:/m.test(make)) { info.lint ??= 'make lint'; }
        if (/^(run|dev|serve)\s*:/m.test(make)) { info.run ??= `make ${/^(run|dev|serve)\s*:/m.exec(make)![1]}`; }
    }

    info.stack = Array.from(new Set(info.stack));
    return info;
}
