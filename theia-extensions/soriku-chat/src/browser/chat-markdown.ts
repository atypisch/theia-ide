/********************************************************************************
 * Soriku IDE — lightweight chat markdown (fenced code + prose)
 *
 * SPDX-License-Identifier: MIT
 ********************************************************************************/

function escapeHtml(text: string): string {
    return text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

/** Minimal syntax colours for common agent output languages. */
function highlightCode(lang: string, code: string): string {
    const escaped = escapeHtml(code);
    const l = (lang || '').toLowerCase();
    if (l === 'json') {
        return escaped.replace(
            /("(?:\\.|[^"\\])*")\s*:/g,
            '<span class="soriku-hl-key">$1</span>:',
        );
    }
    const kw = /\b(const|let|var|function|return|if|else|for|while|import|from|export|class|async|await|new|def|elif|php|public|private|protected)\b/g;
    const str = /('(?:\\.|[^'\\])*'|"(?:\\.|[^"\\])*"|`(?:\\.|[^`\\])*`)/g;
    const cmt = /(\/\/[^\n]*|\/\*[\s\S]*?\*\/|#[^\n]*|&lt;!--[\s\S]*?--&gt;)/g;
    return escaped
        .replace(cmt, '<span class="soriku-hl-cmt">$1</span>')
        .replace(str, '<span class="soriku-hl-str">$1</span>')
        .replace(kw, '<span class="soriku-hl-kw">$1</span>');
}

function renderInlineProse(line: string): string {
    let s = escapeHtml(line);
    s = s.replace(/`([^`]+)`/g, '<code class="soriku-inline-code">$1</code>');
    s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    s = s.replace(/\*([^*]+)\*/g, '<em>$1</em>');
    s = s.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');
    return s;
}

function renderProseBlock(text: string): string {
    const lines = text.split('\n');
    const out: string[] = [];
    let inUl = false;
    const closeUl = () => {
        if (inUl) {
            out.push('</ul>');
            inUl = false;
        }
    };
    for (const raw of lines) {
        const line = raw.trimEnd();
        if (!line.trim()) {
            closeUl();
            continue;
        }
        const h = line.match(/^(#{1,4})\s+(.+)$/);
        if (h) {
            closeUl();
            const level = h[1].length;
            out.push(`<h${level} class="soriku-md-h${level}">${renderInlineProse(h[2])}</h${level}>`);
            continue;
        }
        if (/^[-*]\s+/.test(line)) {
            if (!inUl) {
                out.push('<ul class="soriku-md-ul">');
                inUl = true;
            }
            out.push(`<li>${renderInlineProse(line.replace(/^[-*]\s+/, ''))}</li>`);
            continue;
        }
        closeUl();
        out.push(`<p class="soriku-md-p">${renderInlineProse(line)}</p>`);
    }
    closeUl();
    return out.join('');
}

export function renderChatMarkdownHtml(source: string): string {
    if (!source.trim()) {
        return '';
    }
    const parts: string[] = [];
    const fence = /```([^\n`]*)\n([\s\S]*?)```/g;
    let last = 0;
    let match: RegExpExecArray | null;
    while ((match = fence.exec(source)) !== null) {
        if (match.index > last) {
            parts.push(renderProseBlock(source.slice(last, match.index)));
        }
        const lang = (match[1] || 'text').trim();
        const body = match[2].replace(/\n$/, '');
        parts.push(
            `<div class="soriku-code-block">`
            + `<div class="soriku-code-lang">${escapeHtml(lang || 'code')}</div>`
            + `<pre><code class="language-${escapeHtml(lang)}">${highlightCode(lang, body)}</code></pre>`
            + `</div>`,
        );
        last = match.index + match[0].length;
    }
    if (last < source.length) {
        parts.push(renderProseBlock(source.slice(last)));
    }
    return parts.join('');
}
