/********************************************************************************
 * Soriku IDE — Settings page groups/rows (Engine, Privacy, Appearance, …),
 * 1:1 from the mockup's settingsGroups pattern.
 *
 * SPDX-License-Identifier: MIT
 ********************************************************************************/

import * as React from '@theia/core/shared/react';

export function SettingsGroup({ title, children }: { title: string; children: React.ReactNode }): React.ReactElement {
    return (
        <div className="sk-settings-group">
            <div className="sk-settings-group-title">{title}</div>
            <div className="sk-settings-group-body">{children}</div>
        </div>
    );
}

export function SettingsRow({ label, description, control }: {
    label: string;
    description: string;
    control: React.ReactNode;
}): React.ReactElement {
    return (
        <div className="sk-settings-row">
            <div className="sk-settings-row-label">
                <div className="sk-settings-row-title">{label}</div>
                <div className="sk-settings-row-desc">{description}</div>
            </div>
            {control}
        </div>
    );
}
