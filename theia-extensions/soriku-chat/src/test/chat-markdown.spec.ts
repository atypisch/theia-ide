import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { renderChatMarkdownHtml } from '../browser/chat-markdown';

describe('renderChatMarkdownHtml', () => {
    it('renders fenced code with language label', () => {
        const html = renderChatMarkdownHtml('```js\nconst x = 1;\n```');
        assert.ok(html.includes('soriku-code-block'));
        assert.ok(html.includes('language-js'));
        assert.ok(html.includes('const'));
    });

    it('renders inline code and headings', () => {
        const html = renderChatMarkdownHtml('## Title\nUse `apiFetch` here.');
        assert.ok(html.includes('soriku-md-h2'));
        assert.ok(html.includes('soriku-inline-code'));
        assert.ok(html.includes('apiFetch'));
    });

    it('escapes raw html in prose', () => {
        const html = renderChatMarkdownHtml('<script>alert(1)</script>');
        assert.ok(!html.includes('<script>'));
        assert.ok(html.includes('&lt;script&gt;'));
    });
});
