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

/**
 * soriku.com's browser-login entry point. Its redirect back to
 * `soriku://auth-callback#token=…` is built in Fase 8 (soriku.com); this IDE
 * side (the `soriku://` protocol registration + SorikuAuthUriHandler) is
 * real and complete, but the full round-trip only works once that lands.
 */
export const SORIKU_LOGIN_URL = 'https://soriku.com/login?target=ide';

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
     * Connect via browser sign-in (soriku.com hands off to `soriku://auth-callback#token=…`,
     * caught by SorikuAuthUriHandler and routed to `applyDeepLinkToken`) — pasting a key
     * remains the fallback for whenever the deep-link round-trip doesn't land, e.g. no
     * `soriku://` handler registered yet, or the browser session is in a different profile.
     * No-op in local mode.
     */
    async connect(): Promise<void> {
        try {
            const authMode = await this.engineClient.getAuthMode();
            if (normalizeAuthMode(authMode.auth_mode) === 'local') {
                this.messages.info('Soriku engine is in local mode — no sign-in required.');
                await this.refresh();
                return;
            }
        } catch (e) {
            this.messages.error(`Could not reach the Soriku engine: ${(e as Error).message}`);
            return;
        }
        this.windowService.openNewWindow(SORIKU_LOGIN_URL);
        const key = await this.quickInput.input({
            title: 'Connect to Simezu',
            prompt: 'Finish signing in in the browser tab — or paste your Simezu API key here',
            placeHolder: 'sk-soriku-…',
            password: true,
        });
        if (!key || !key.trim()) {
            return;
        }
        await this.applyToken(key.trim());
    }

    /**
     * Applies a token obtained via the `soriku://auth-callback` deep link — called by
     * SorikuAuthUriHandler, never by `connect()` itself (which uses the paste-key path).
     * Safe to call even when no `connect()` is in flight (e.g. the user re-triggered
     * sign-in from a stray browser tab); it just re-applies the token either way.
     */
    async applyDeepLinkToken(token: string): Promise<void> {
        await this.applyToken(token, { source: 'deep-link' });
    }

    /** Store a token (keychain, best-effort) and refresh state from it. Shared by paste-key and deep-link. */
    protected async applyToken(token: string, options?: { source: 'paste' | 'deep-link' }): Promise<void> {
        this.setTokenInternal(token);
        try {
            await this.credentials.setPassword(CREDENTIALS_SERVICE, CREDENTIALS_ACCOUNT, token);
        } catch (e) {
            this.messages.warn(`Token saved for this session only (keychain unavailable): ${(e as Error).message}`);
        }
        await this.refresh();
        if (this.state.error) {
            this.messages.error(this.state.error);
        } else {
            const prefix = options?.source === 'deep-link' ? 'Signed in via browser — ' : '';
            this.messages.info(prefix + computeStatusView(this.state).text);
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
