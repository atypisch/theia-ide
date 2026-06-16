/********************************************************************************
 * Soriku IDE — tools-bridge frontend DI module
 *
 * SPDX-License-Identifier: MIT
 ********************************************************************************/

import { ContainerModule } from '@theia/core/shared/inversify';
import { SorikuToolConfirmationService } from './soriku-tool-confirmation-service';

export default new ContainerModule(bind => {
    bind(SorikuToolConfirmationService).toSelf().inSingletonScope();
});
