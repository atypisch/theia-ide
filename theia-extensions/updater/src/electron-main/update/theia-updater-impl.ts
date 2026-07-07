/********************************************************************************
 * Copyright (C) 2020 TypeFox, EclipseSource and others.
 *
 * This program and the accompanying materials are made available under the
 * terms of the MIT License, which is available in the project root.
 *
 * SPDX-License-Identifier: MIT
 ********************************************************************************/

import { ElectronMainApplication, ElectronMainApplicationContribution } from '@theia/core/lib/electron-main/electron-main-application';
import { TheiaUpdater, TheiaUpdaterClient, UpdaterSettings } from '../../common/updater/theia-updater';
import { injectable } from '@theia/core/shared/inversify';
import { isOSX, isWindows } from '@theia/core';
import { CancellationToken } from 'builder-util-runtime';

/**
 * soriku.com hosts both the update manifest and the artifacts (user's own
 * decision, Fase 6/7 planning) — one path shape, no Eclipse infra involved.
 * Overridable via SORIKU_UPDATE_BASE for staging a release against a local
 * http server before it's live on soriku.com.
 */
const UPDATE_BASE = process.env.SORIKU_UPDATE_BASE || 'https://soriku.com/downloads/ide';

function feedUrl(channel: 'stable' | 'preview', platform: 'windows' | 'macos' | 'macos-arm' | 'linux'): string {
    return `${UPDATE_BASE}/${channel}/${platform}`;
}

const { autoUpdater } = require('electron-updater');

autoUpdater.logger = require('electron-log');
autoUpdater.logger.transports.file.level = 'info';

@injectable()
export class TheiaUpdaterImpl implements TheiaUpdater, ElectronMainApplicationContribution {

    protected clients: Array<TheiaUpdaterClient> = [];
    protected settings: UpdaterSettings = {
        checkForUpdates: true,
        checkInterval: 60,
        channel: 'stable'
    };

    private initialCheck: boolean = true;
    private reportOnFirstRegistration: boolean = false;
    private cancellationToken: CancellationToken = new CancellationToken();
    private updateCheckTimer: NodeJS.Timeout | undefined;

    constructor() {
        autoUpdater.autoDownload = false;
        autoUpdater.on('update-available', (info: { version: string }) => {
            if (this.initialCheck) {
                this.initialCheck = false;
                if (this.clients.length === 0) {
                    this.reportOnFirstRegistration = true;
                }
            }
            const updateInfo = { version: info.version };
            this.clients.forEach(c => c.updateAvailable(true, updateInfo));
        });
        autoUpdater.on('update-not-available', () => {
            if (this.initialCheck) {
                this.initialCheck = false;
                return;
            }
            this.clients.forEach(c => c.updateAvailable(false));
        });

        autoUpdater.on('update-downloaded', () => {
            this.clients.forEach(c => c.notifyReadyToInstall());
        });

        autoUpdater.on('error', (err: unknown) => {
            if (err instanceof Error && err.message.includes('cancelled')) {
                return;
            }
            const errorLogPath = autoUpdater.logger.transports.file.getFile().path;
            this.clients.forEach(c => c.reportError({ message: 'An error has occurred while attempting to update.', errorLogPath }));
        });
    }

    checkForUpdates(): void {
        const feedURL = this.getFeedURL(this.settings.channel);
        autoUpdater.setFeedURL(feedURL);
        autoUpdater.checkForUpdates();
    }

    setUpdaterSettings(settings: UpdaterSettings): void {
        const settingsChanged = this.settings.checkForUpdates !== settings.checkForUpdates ||
            this.settings.checkInterval !== settings.checkInterval ||
            this.settings.channel !== settings.channel;
        this.settings = settings;
        if (settingsChanged) {
            this.scheduleUpdateChecks();
        }
    }

    onRestartToUpdateRequested(): void {
        autoUpdater.quitAndInstall();
    }

    cancel(): void {
        autoUpdater.logger.info('Update cancelled by user');
        this.cancellationToken.cancel();
        this.clients.forEach(c => c.reportCancelled());
    }

    downloadUpdate(): void {
        autoUpdater.logger.info('Downloading update');
        this.cancellationToken = new CancellationToken();
        autoUpdater.downloadUpdate(this.cancellationToken);
        // No download-stat ping here (the eclipse.org one this replaced sent
        // a bare tracking request to eclipse.org on every download) —
        // telemetry-free is a Soriku IDE product commitment, not a default.
    }

    onStart(application: ElectronMainApplication): void {
    }

    onStop(application: ElectronMainApplication): void {
        this.stopUpdateCheckTimer();
    }

    private scheduleUpdateChecks(): void {
        this.stopUpdateCheckTimer();

        if (!this.settings.checkForUpdates) {
            return;
        }

        this.checkForUpdates();

        const intervalMs = Math.max(this.settings.checkInterval, 1) * 60 * 1000;

        this.updateCheckTimer = setInterval(() => {
            if (this.settings.checkForUpdates) {
                this.checkForUpdates();
            }
        }, intervalMs);
    }

    private stopUpdateCheckTimer(): void {
        if (this.updateCheckTimer) {
            clearInterval(this.updateCheckTimer);
            this.updateCheckTimer = undefined;
        }
    }

    setClient(client: TheiaUpdaterClient | undefined): void {
        if (client) {
            this.clients.push(client);
            if (this.reportOnFirstRegistration) {
                this.reportOnFirstRegistration = false;
                this.clients.forEach(c => c.updateAvailable(true));
            }
        }
    }

    protected getFeedURL(channel: string): string {
        const resolvedChannel = channel === 'preview' ? 'preview' : 'stable';
        if (isWindows) {
            return feedUrl(resolvedChannel, 'windows');
        }
        if (isOSX) {
            return feedUrl(resolvedChannel, process.arch === 'arm64' ? 'macos-arm' : 'macos');
        }
        return feedUrl(resolvedChannel, 'linux');
    }

    disconnectClient(client: TheiaUpdaterClient): void {
        const index = this.clients.indexOf(client);
        if (index !== -1) {
            this.clients.splice(index, 1);
        }
    }

    dispose(): void {
        this.stopUpdateCheckTimer();
        this.clients.forEach(this.disconnectClient.bind(this));
    }

}
