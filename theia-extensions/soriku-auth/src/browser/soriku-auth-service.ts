/********************************************************************************
 * Soriku IDE — auth service (token state, keychain, connect/disconnect)
 *
 * SPDX-License-Identifier: MIT
 ********************************************************************************/

import { inject, injectable } from '@theia/core/shared/inversify';
import { Emitter, Event, MessageService } from '@theia/core/lib/common';
import { QuickInputService } from '@theia/core/lib/browser';
import { CredentialsService } from '@theia/core/lib/browser/credentials-service';
import { WindowService } from '@theia/core/lib/browser/window/window-service';
import { EngineClient } from 'soriku-engine-client-ext/lib/common/engine-client';
import { EngineAuthTokenHolder } from 'soriku-engine-client-ext/lib/browser/engine-auth-token-holder';
import {
    AuthState,
    computeStatusView,
    normalizeAuthMode,
    pickUserName,
} from '../common/auth-status';

/** Keychain coordinates for the engine bearer token. */
export const CREDENTIALS_SERVICE = 'soriku-ide';
export const CREDENTIALS_ACCOUNT = 'engine-auth-token';

@injectable()
export class SorikuAuthService {

    @inject(EngineClient)
    protected readonly engineClient: EngineClient;

    @inject(CredentialsService)
    protected readonly credentials: CredentialsService;

    @inject(WindowService)
    protected readonly windowService: WindowService;

    @inject(QuickInputService)
    protected readonly quickInput: QuickInputService;

    @inject(MessageService)
    protected readonly messages: MessageService;

    @inject(EngineAuthTokenHolder)
    protected readonly tokenHolder: EngineAuthTokenHolder;

    protected token: string | undefined;
    protected state: AuthState = { mode: 'unknown', hasToken: false };

    protected readonly onDidChangeStateEmitter = new Emitter<AuthState>();
    readonly onDidChangeState: Event<AuthState> = this.onDidChangeStateEmitter.event;

    /** Token consumed by the EngineAuthProvider seam; undefined in local/unauthenticated mode. */
    getToken(): string | undefined {
        return this.token;
    }

    getState(): AuthState {
        return this.state;
    }

    /** Load any stored token and compute the initial state. Safe to call once at startup. */
    async initialize(): Promise<void> {
        try {
            this.setTokenInternal((await this.credentials.getPassword(CREDENTIALS_SERVICE, CREDENTIALS_ACCOUNT)) ?? undefined);
        } catch {
            this.setTokenInternal(undefined);
        }
        await this.refresh();
    }

    /** Re-query the engine for auth mode and (if applicable) the signed-in user. */
    async refresh(): Promise<void> {
        try {
            const mode = normalizeAuthMode((await this.engineClient.getAuthMode()).auth_mode);
            let user: string | undefined;
            let error: string | undefined;
            if (mode === 'simezu' && this.token) {
                try {
                    user = pickUserName(await this.engineClient.whoami());
                } catch (e) {
                    error = `Token rejected by engine: ${(e as Error).message}`;
                }
            }
            this.setState({ mode, hasToken: !!this.token, user, error });
        } catch (e) {
            this.setState({ mode: 'unknown', hasToken: !!this.token, error: `Engine unreachable: ${(e as Error).message}` });
        }
    }

    /**
     * Connect by pasting a Simezu API key. Opens the Simezu site in the browser (so the user can
     * mint a key) and stores the pasted key in the OS keychain. No-op in local mode.
     */
    async connect(): Promise<void> {
        let simezuUrl: string | undefined;
        try {
            const authMode = await this.engineClient.getAuthMode();
            if (normalizeAuthMode(authMode.auth_mode) === 'local') {
                this.messages.info('Soriku engine is in local mode — no sign-in required.');
                await this.refresh();
                return;
            }
            simezuUrl = authMode.simezu_base_url ?? undefined;
        } catch (e) {
            this.messages.error(`Could not reach the Soriku engine: ${(e as Error).message}`);
            return;
        }
        if (simezuUrl) {
            this.windowService.openNewWindow(simezuUrl);
        }
        const key = await this.quickInput.input({
            title: 'Connect to Simezu',
            prompt: 'Paste your Simezu API key',
            placeHolder: 'sk-soriku-…',
            password: true,
        });
        if (!key || !key.trim()) {
            return;
        }
        this.setTokenInternal(key.trim());
        try {
            await this.credentials.setPassword(CREDENTIALS_SERVICE, CREDENTIALS_ACCOUNT, key.trim());
        } catch (e) {
            this.messages.warn(`Token saved for this session only (keychain unavailable): ${(e as Error).message}`);
        }
        await this.refresh();
        if (this.state.error) {
            this.messages.error(this.state.error);
        } else {
            this.messages.info(computeStatusView(this.state).text);
        }
    }

    /** Remove the stored token and drop back to unauthenticated mode. */
    async disconnect(): Promise<void> {
        this.setTokenInternal(undefined);
        try {
            await this.credentials.deletePassword(CREDENTIALS_SERVICE, CREDENTIALS_ACCOUNT);
        } catch {
            // Nothing stored / keychain unavailable — state is already cleared.
        }
        await this.refresh();
        this.messages.info('Disconnected from Simezu.');
    }

    protected setState(state: AuthState): void {
        this.state = state;
        this.onDidChangeStateEmitter.fire(state);
    }

    /** Update the in-memory token and mirror it into the holder the EngineClient reads. */
    protected setTokenInternal(token: string | undefined): void {
        this.token = token;
        this.tokenHolder.setToken(token);
    }
}
