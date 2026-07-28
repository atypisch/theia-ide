/********************************************************************************
 * Soriku IDE — tools-bridge backend DI module
 *
 * SPDX-License-Identifier: MIT
 ********************************************************************************/

import { ContainerModule } from '@theia/core/shared/inversify';
import { ConnectionHandler, RpcConnectionHandler } from '@theia/core/lib/common/messaging';
import { SORIKU_SHELL_SERVICE_PATH } from '../common/shell-service';
import { SorikuShellServiceImpl } from './soriku-shell-service-impl';

export default new ContainerModule(bind => {
    bind(SorikuShellServiceImpl).toSelf().inSingletonScope();
    bind(ConnectionHandler).toDynamicValue(ctx =>
        new RpcConnectionHandler(SORIKU_SHELL_SERVICE_PATH, () => ctx.container.get(SorikuShellServiceImpl)),
    ).inSingletonScope();
});
