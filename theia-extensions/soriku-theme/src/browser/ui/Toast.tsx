/********************************************************************************
 * Soriku IDE — bottom-center toast, 1:1 from the mockup ("Opened chat with …").
 *
 * SPDX-License-Identifier: MIT
 ********************************************************************************/

import * as React from '@theia/core/shared/react';

export interface ToastProps {
    message: string | undefined;
    onDismiss: () => void;
}

export function Toast({ message, onDismiss }: ToastProps): React.ReactElement | null {
    if (!message) {
        // React requires `null` (not `undefined`) for a component that renders nothing when used as a JSX tag.
        // eslint-disable-next-line no-null/no-null
        return null;
    }
    return (
        <div className="sk-toast" onClick={onDismiss}>
            <span className="sk-toast-icon">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2}>
                    <polyline points="20 6 9 17 4 12" />
                </svg>
            </span>
            {message}
        </div>
    );
}
