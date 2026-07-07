/********************************************************************************
 * Soriku IDE — catches the `soriku://auth-callback#token=…` deep link
 *
 * SPDX-License-Identifier: MIT
 ********************************************************************************/

import { inject, injectable } from '@theia/core/shared/inversify';
import URI from '@theia/core/lib/common/uri';
import { OpenHandler } from '@theia/core/lib/browser/opener-service';
import { DEEP_LINK_AUTH_HOST, DEEP_LINK_SCHEME, parseDeepLinkToken } from '../common/auth-status';
import { SorikuAuthService } from './soriku-auth-service';

@injectable()
export class SorikuAuthUriHandler implements OpenHandler {

    readonly id = 'soriku-auth-uri-handler';
    readonly label = 'Soriku Sign-in';

    @inject(SorikuAuthService)
    protected readonly authService: SorikuAuthService;

    canHandle(uri: URI): number {
        return uri.scheme === DEEP_LINK_SCHEME && uri.authority === DEEP_LINK_AUTH_HOST ? 100 : 0;
    }

    async open(uri: URI): Promise<object | undefined> {
        const token = parseDeepLinkToken(uri.toString());
        if (token) {
            await this.authService.applyDeepLinkToken(token);
        }
        return undefined;
    }
}
