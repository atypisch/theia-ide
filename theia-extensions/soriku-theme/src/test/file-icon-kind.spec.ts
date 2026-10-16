/********************************************************************************
 * Soriku IDE — file-icon-kind test
 *
 * SPDX-License-Identifier: MIT
 ********************************************************************************/

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { fileIconKind, isEnvSecretFile } from '../common/file-icon-kind';

describe('fileIconKind', () => {
    it('maps the v2 mockup file types', () => {
        assert.equal(fileIconKind('chat'), 'chat');
        assert.equal(fileIconKind('plan.md'), 'plan');
        assert.equal(fileIconKind('schema.sql'), 'db');
        assert.equal(fileIconKind('app.sqlite'), 'db');
        assert.equal(fileIconKind('router.py'), 'code');
        assert.equal(fileIconKind('index.php'), 'code');
        assert.equal(fileIconKind('App.vue'), 'code');
        assert.equal(fileIconKind('pyproject.toml'), 'config');
        assert.equal(fileIconKind('.env.local'), 'config');
        assert.equal(fileIconKind('README.md'), 'text');
        assert.equal(fileIconKind('Makefile'), 'text');
    });

    it('detects test files', () => {
        assert.equal(fileIconKind('test_router.py'), 'code-test');
        assert.equal(fileIconKind('router.test.ts'), 'code-test');
        assert.equal(fileIconKind('router.spec.ts'), 'code-test');
        assert.equal(fileIconKind('router_test.go'), 'code-test');
        assert.equal(fileIconKind('contest.py'), 'code');
    });

    it('ignores directories in the path and letter case', () => {
        assert.equal(fileIconKind('src/Agents/Router.PY'), 'code');
        assert.equal(fileIconKind('/a/b/test_x.py'), 'code-test');
    });
});

describe('isEnvSecretFile', () => {
    it('flags real env files, not templates', () => {
        assert.equal(isEnvSecretFile('.env'), true);
        assert.equal(isEnvSecretFile('.env.production'), true);
        assert.equal(isEnvSecretFile('config/.env.local'), true);
        assert.equal(isEnvSecretFile('.env.example'), false);
        assert.equal(isEnvSecretFile('.env.sample'), false);
        assert.equal(isEnvSecretFile('environment.ts'), false);
    });
});
