/********************************************************************************
 * Soriku IDE — chat markdown React view
 *
 * SPDX-License-Identifier: MIT
 ********************************************************************************/

import * as React from '@theia/core/shared/react';
import { renderChatMarkdownHtml } from './chat-markdown';

export function ChatMarkdown(props: { text: string; streaming?: boolean }): React.ReactElement {
    const html = React.useMemo(() => renderChatMarkdownHtml(props.text), [props.text]);
    if (!html) {
        return <></>;
    }
    return <div
        className={`soriku-md${props.streaming ? ' soriku-md-streaming' : ''}`}
        dangerouslySetInnerHTML={{ __html: html }}
    />;
}
