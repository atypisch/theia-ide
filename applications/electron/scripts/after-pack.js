#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const util = require('util');
const rimraf = require('rimraf');
const asyncRimraf = util.promisify(rimraf);

const DELETE_PATHS = [
    'Contents/Resources/app/node_modules/unzip-stream/aa.zip',
    'Contents/Resources/app/node_modules/unzip-stream/testData*'
];

// Signing/notarization is electron-builder's own built-in flow now (see
// electron-builder.yml's mac.notarize block) — CSC_LINK/CSC_KEY_PASSWORD and
// APPLE_ID/APPLE_APP_SPECIFIC_PASSWORD/APPLE_TEAM_ID in the environment are
// all it needs. The custom sign.sh/notarize.sh this replaced shelled out to
// an Eclipse-Foundation-only SSH relay (genie.theia@projects-storage.eclipse.org)
// — unusable outside Eclipse's CI, so there was nothing there to keep.
exports.default = async function (context) {
    await afterPackHook(context);
    const appPath = path.resolve(context.appOutDir, `${context.packager.appInfo.productFilename}.app`);

    // Remove anything we don't want in the final package
    for (const deletePath of DELETE_PATHS) {
        const resolvedPath = path.resolve(appPath, deletePath);
        console.log(`Deleting ${resolvedPath}...`);
        await asyncRimraf(resolvedPath);
    }
};

// taken and modified from: https://github.com/gergof/electron-builder-sandbox-fix/blob/a2251d7d8f22be807d2142da0cf768c78d4cfb0a/lib/index.js
const afterPackHook = async params => {
    if (params.electronPlatformName !== 'linux') {
        // this fix is only required on linux
        return;
    }
    const executable = path.join(
        params.appOutDir,
        params.packager.executableName
    );

    const loaderScript = `#!/usr/bin/env bash
set -u
SCRIPT_DIR="$( cd "$( dirname "\${BASH_SOURCE[0]}" )" && pwd )"
exec "$SCRIPT_DIR/${params.packager.executableName}.bin" "--no-sandbox" "$@"
`;

    try {
        await fs.promises.rename(executable, executable + '.bin');
        await fs.promises.writeFile(executable, loaderScript);
        await fs.promises.chmod(executable, 0o755);
    } catch (e) {
        throw new Error('Failed to create loader for sandbox fix:\n' + e);
    }
};
