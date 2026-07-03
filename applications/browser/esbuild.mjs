/**
 * This file can be edited to adjust the ESBuild build process.
 * To reset, delete this file and rerun theia build again.
 */
import { browserOptions, watch, __dirname, join } from './gen-esbuild.browser.mjs';
import { nodeOptions } from './gen-esbuild.node.mjs';
import { copy } from 'esbuild-plugin-copy';
import fs from 'node:fs';
import path from 'node:path';

import esbuild from 'esbuild';

// serve favicon from root and inject link tag into index.html
browserOptions.plugins.push(
    copy({
        assets: [{
            from: join(__dirname, 'ico', '**', '*'),
            to: join(__dirname, 'lib', 'frontend')
        }]
    }),
    {
        name: 'favicon-link',
        setup(build) {
            build.onEnd(() => {
                const indexPath = path.join(__dirname, 'lib', 'frontend', 'index.html');
                if (fs.existsSync(indexPath)) {
                    let html = fs.readFileSync(indexPath, 'utf8');
                    if (!html.includes('rel="icon"')) {
                        html = html.replace('</head>', '  <link rel="icon" type="image/x-icon" href="./favicon.ico">\n</head>');
                        fs.writeFileSync(indexPath, html);
                    }
                }
            });
        }
    }
);

// Bundle attribution (OPT Phase 3): emit an esbuild metafile per build so size
// work is measured per module, never guessed. Written OUTSIDE lib/ (build-meta/)
// so it is never served or deployed with the app.
browserOptions.metafile = true;

const browserContext = await esbuild.context(browserOptions);
const nodeContext = await esbuild.context(nodeOptions);

function writeMetafile(result) {
    if (!result || !result.metafile) {
        return;
    }
    const outDir = path.join(__dirname, 'build-meta');
    fs.mkdirSync(outDir, { recursive: true });
    fs.writeFileSync(path.join(outDir, 'browser.meta.json'), JSON.stringify(result.metafile));
}

if (watch) {
    await Promise.all([
        browserContext.watch(),
        nodeContext.watch(),
    ]);
} else {
    try {
        writeMetafile(await browserContext.rebuild());
        await browserContext.dispose();
        await nodeContext.rebuild();
        await nodeContext.dispose();
    } catch {
        process.exit(1);
    }
}
