/********************************************************************************
 * Soriku IDE — tools-bridge frontend DI module
 *
 * SPDX-License-Identifier: MIT
 ********************************************************************************/

import { ContainerModule } from '@theia/core/shared/inversify';
import { SorikuToolConfirmationService } from './soriku-tool-confirmation-service';
import { SorikuEditorRevealService } from './soriku-editor-reveal-service';
import { SorikuToolApprovalBridge } from './soriku-tool-approval-bridge';

export default new ContainerModule(bind => {
    bind(SorikuToolApprovalBridge).toSelf().inSingletonScope();
    bind(SorikuEditorRevealService).toSelf().inSingletonScope();
    bind(SorikuToolConfirmationService).toSelf().inSingletonScope();
});
