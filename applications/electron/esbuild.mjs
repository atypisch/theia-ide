/**
 * This file can be edited to adjust the ESBuild build process.
 * To reset, delete this file and rerun theia build again.
 */
import { browserOptions, watch } from './gen-esbuild.browser.mjs';
import { nodeOptions } from './gen-esbuild.node.mjs';
import { electronOptions } from './gen-esbuild.electron.mjs';
import esbuild from 'esbuild';
import { createRequire } from 'module';
import path from 'path';
import fs from 'node:fs';

const require = createRequire(import.meta.url);
const resolvePackagePath = require('resolve-package-path');

function resolveModulePath(moduleName) {
    const modulePath = resolvePackagePath(moduleName, process.cwd());
    if (!modulePath) {
        throw new Error('Could not resolve path of module: ' + moduleName);
    }
    return path.resolve(modulePath, '..');
}

/**
 * Plugin to patch ripgrep path for asar compatibility.
 * When packaged with asar, __dirname resolves inside app.asar but native binaries
 * are extracted to app.asar.unpacked via electron-builder's asarUnpack config.
 * The upstream esbuild native plugin doesn't handle this, so we override its
 * ripgrep replacement with one that includes asar path rewriting.
 */
const asarRipgrepPlugin = {
    name: 'asar-ripgrep',
    setup(build) {
        build.onLoad({ filter: /@vscode[/\\]ripgrep[/\\]lib[/\\]index\.js$/ }, async () => ({
            contents: `
                const path = require("path");
                let rgPath = path.join(__dirname, \`./native/rg\${process.platform === "win32" ? ".exe" : ""}\`);
                if (rgPath.includes(".asar" + path.sep)) {
                    rgPath = rgPath.replace(".asar" + path.sep, ".asar.unpacked" + path.sep);
                }
                export { rgPath };
            `,
            loader: 'js'
        }));
    }
};

/**
 * Plugin to fix @parcel/watcher's native binding resolution.
 * @theia/bundle-plugin's nativeDependenciesPlugin resolves watcher.node's path
 * correctly but forgets to tag the result with `namespace: 'node-file'` (unlike
 * its otherwise-identical keymapping.node handler right above it in the same
 * file). Without that tag, esbuild's default `.node` -> `file` loader kicks in
 * and replaces the require with a bare path STRING instead of an actual
 * `require()` call — so the packaged app's file watcher throws
 * `TypeError: t.subscribe is not a function` at runtime, since the "loaded
 * module" is really just a string. Re-registering the same resolution here,
 * ahead of the buggy one, with the namespace correctly set routes it through
 * the plugin's own (working) node-file require pipeline instead.
 */
const parcelWatcherPlugin = {
    name: 'parcel-watcher-native-file',
    setup(build) {
        build.onResolve({ filter: /\.\/build\/Release\/watcher\.node$/ }, () => {
            let name = `@parcel/watcher-${process.platform}-${process.arch}`;
            if (process.platform === 'linux') {
                const { MUSL, family } = require('detect-libc');
                name += family === MUSL ? '-musl' : '-glibc';
            }
            return {
                path: path.join(resolveModulePath(name), 'watcher.node'),
                namespace: 'node-file'
            };
        });
    }
};

// Add asar ripgrep + parcel-watcher plugins before the native dependencies
// plugin so they take precedence (esbuild uses the first onResolve match).
nodeOptions.plugins.unshift(asarRipgrepPlugin, parcelWatcherPlugin);

// Phase 5.0 (RAM/weight measurement): emit esbuild's own bundle-composition
// metafile for the browser (renderer) bundle — the one that actually ships
// to users and matters for cold-load/download size. Skipped in watch mode
// (dev iteration doesn't need it, and re-writing on every incremental
// rebuild would just be noise).
browserOptions.metafile = true;

const browserContext = await esbuild.context(browserOptions);
const nodeContext = await esbuild.context(nodeOptions);
const electronContext = await esbuild.context(electronOptions);

if (watch) {
    await Promise.all([
        browserContext.watch(),
        nodeContext.watch(),
        electronContext.watch(),
    ]);
} else {
    try {
        const browserResult = await browserContext.rebuild();
        await browserContext.dispose();
        if (browserResult.metafile) {
            fs.writeFileSync(
                path.join(browserOptions.outdir, 'meta-browser.json'),
                JSON.stringify(browserResult.metafile),
            );
        }
        await nodeContext.rebuild();
        await nodeContext.dispose();
        await electronContext.rebuild();
        await electronContext.dispose();
    } catch {
        process.exit(1);
    }
}
