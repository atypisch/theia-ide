/********************************************************************************
 * Soriku IDE — WebdriverIO smoke test for the Soriku chat panel (Phase 4.2)
 *
 * Two tiers:
 *   - Always: the chat panel opens on startup (Phase 6's default-layout
 *     behaviour) and its input accepts typed text. No engine required.
 *   - Gated behind SORIKU_E2E=1 (a live engine on the configured base URL):
 *     sends a real "create a file" request through the chat and asserts the
 *     file actually lands on disk with the requested content — the same
 *     shell-service delegation path Phase 1 built (soriku-tools-bridge).
 *
 * Mirrors app.spec.js's launch/close/screenshot conventions so both specs
 * behave identically under `yarn --cwd applications/electron test`.
 *
 * SPDX-License-Identifier: MIT
 ********************************************************************************/

const os = require('os');
const path = require('path');
const fs = require('fs');
const { execSync } = require('child_process');
const { remote } = require('webdriverio');
const { expect } = require('chai');

const THEIA_LOAD_TIMEOUT = 15000; // 15 seconds

process.env.THEIA_NO_SPLASH = '1';

const appDir = process.cwd();

const screenshotDir = path.join(appDir, 'test-screenshots');
if (!fs.existsSync(screenshotDir)) {
  fs.mkdirSync(screenshotDir, { recursive: true });
}

async function saveScreenshot(browser, name) {
  try {
    const filePath = path.join(screenshotDir, `${name}.png`);
    await browser.saveScreenshot(filePath);
    console.log(`Screenshot saved: ${filePath}`);
  } catch (err) {
    console.error(`Failed to save screenshot "${name}":`, err.message);
  }
}

const builderConfig = fs.readFileSync(path.join(appDir, 'electron-builder.yml'), 'utf8');
const productName = builderConfig.match(/^productName:\s*(.+)$/m)[1].trim();
const packageName = require(path.join(appDir, 'package.json')).name;

function isMacArm() {
  if (os.platform() !== 'darwin') {
    return false;
  }
  try {
    const arch = execSync('uname -m').toString().trim();
    return arch === 'arm64';
  } catch (error) {
    return os.arch() === 'arm64';
  }
}

function getBinaryPath() {
  const distFolder = path.join(appDir, 'dist');
  switch (os.platform()) {
    case 'linux':
      return path.join(distFolder, 'linux-unpacked', packageName);
    case 'win32':
      return path.join(distFolder, 'win-unpacked', `${productName}.exe`);
    case 'darwin': {
      const macFolder = isMacArm() ? 'mac-arm64' : 'mac';
      return path.join(distFolder, macFolder, `${productName}.app`, 'Contents', 'MacOS', productName);
    }
    default:
      return undefined;
  }
}

/** Fresh scratch workspace so this spec never touches the shared test/workspace fixture. */
function makeScratchWorkspace(prefix) {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

async function launchApp(workspaceDir) {
  const binary = getBinaryPath();
  if (!binary) {
    throw new Error('Tests are not supported for this platform.');
  }

  const browser = await remote({
    logLevel: 'info',
    capabilities: {
      browserName: 'chrome',
      'goog:chromeOptions': {
        binary,
        args: [workspaceDir],
      },
    },
  });

  const appShell = await browser.$('#theia-app-shell');
  await appShell.waitForExist({
    timeout: THEIA_LOAD_TIMEOUT,
    timeoutMsg: 'Theia took too long to load.',
  });

  // Trust the workspace if Theia asks — same dance as app.spec.js.
  const dialog = await browser.$('.dialogOverlay.workspace-trust-dialog');
  const dialogAppeared = await dialog.waitForExist({ timeout: 5000 }).catch(() => false);
  if (dialogAppeared) {
    const trustButton = await browser.$('.dialogOverlay.workspace-trust-dialog .dialogControl button.theia-button.main');
    const buttonClickable = await trustButton.waitForClickable({ timeout: 2000 }).catch(() => false);
    if (buttonClickable) {
      await trustButton.click();
      await dialog.waitForExist({ timeout: 2000, reverse: true }).catch(() => { });
    }
  }

  return browser;
}

async function closeApp(browser) {
  const CLOSE_TIMEOUT = 10000;
  try {
    await Promise.race([
      browser.closeWindow(),
      new Promise(resolve => setTimeout(resolve, CLOSE_TIMEOUT)),
    ]);
  } catch (err) {
    // Puppeteer/Electron sometimes can't confirm the target closed even
    // though it did — same workaround app.spec.js uses.
    if (`${err}`.includes('Protocol error (Target.createTarget)')) {
      return;
    }
    throw err;
  }
}

describe('Soriku Chat', function () {

  // ── Always: the panel opens and accepts input (no engine required) ────

  describe('panel', function () {
    let workspaceDir;

    beforeEach(async function () {
      workspaceDir = makeScratchWorkspace('soriku-chat-smoke-');
      this.browser = await launchApp(workspaceDir);
    });

    afterEach(async function () {
      if (this.currentTest.state === 'failed' && this.browser) {
        const testName = this.currentTest.title.replace(/\s+/g, '-').toLowerCase();
        await saveScreenshot(this.browser, `FAILED-${testName}`);
      }
      if (this.browser) {
        await closeApp(this.browser);
      }
      if (workspaceDir) {
        fs.rmSync(workspaceDir, { recursive: true, force: true });
      }
    });

    it('opens by default and its input accepts typed text', async function () {
      // Phase 6's default layout reveals the chat view on first start
      // (SorikuChatViewContribution#initializeLayout) — no keybinding needed.
      const chatWidget = await this.browser.$('#soriku-chat');
      await chatWidget.waitForExist({
        timeout: THEIA_LOAD_TIMEOUT,
        timeoutMsg: 'Soriku chat panel did not open on startup.',
      });
      await chatWidget.waitForDisplayed();

      const textarea = await this.browser.$('#soriku-chat textarea.theia-input');
      await textarea.waitForExist({ timeout: 5000 });
      await textarea.setValue('Hello Soriku');

      const value = await textarea.getValue();
      expect(value).to.equal('Hello Soriku');
    });
  });

  // ── Gated: live engine required (SORIKU_E2E=1) ─────────────────────────

  const e2eDescribe = process.env.SORIKU_E2E === '1' ? describe : describe.skip;

  e2eDescribe('live engine (SORIKU_E2E=1)', function () {
    this.timeout(120000);
    let workspaceDir;

    beforeEach(async function () {
      workspaceDir = makeScratchWorkspace('soriku-chat-e2e-');
      // Auto-approve everything and apply edits without a confirmation
      // dialog — a headless smoke test has nobody to click Accept.
      fs.mkdirSync(path.join(workspaceDir, '.theia'), { recursive: true });
      fs.writeFileSync(
        path.join(workspaceDir, '.theia', 'settings.json'),
        JSON.stringify({
          'soriku.tools.autoApprove': 'all',
          'soriku.tools.autoApplyEdits': true,
        }, null, 2),
        'utf8',
      );
      this.browser = await launchApp(workspaceDir);
    });

    afterEach(async function () {
      if (this.currentTest.state === 'failed' && this.browser) {
        const testName = this.currentTest.title.replace(/\s+/g, '-').toLowerCase();
        await saveScreenshot(this.browser, `FAILED-${testName}`);
      }
      if (this.browser) {
        await closeApp(this.browser);
      }
      if (workspaceDir) {
        fs.rmSync(workspaceDir, { recursive: true, force: true });
      }
    });

    it('creates a real file end to end via the chat', async function () {
      const chatWidget = await this.browser.$('#soriku-chat');
      await chatWidget.waitForExist({
        timeout: THEIA_LOAD_TIMEOUT,
        timeoutMsg: 'Soriku chat panel did not open on startup.',
      });

      const textarea = await this.browser.$('#soriku-chat textarea.theia-input');
      await textarea.waitForExist({ timeout: 5000 });
      await textarea.setValue('Create a file named hello.txt containing exactly the text SORIKU_OK, nothing else.');
      await textarea.click();
      await this.browser.keys(['Enter']);

      const targetFile = path.join(workspaceDir, 'hello.txt');
      const deadlineMs = Date.now() + 60000;
      let content;
      while (Date.now() < deadlineMs) {
        if (fs.existsSync(targetFile)) {
          content = fs.readFileSync(targetFile, 'utf8');
          if (content.includes('SORIKU_OK')) {
            break;
          }
        }
        await new Promise(resolve => setTimeout(resolve, 1000));
      }

      expect(fs.existsSync(targetFile), `hello.txt was never created in ${workspaceDir}`).to.equal(true);
      expect(content, 'hello.txt content did not include SORIKU_OK').to.include('SORIKU_OK');
    });
  });
});
