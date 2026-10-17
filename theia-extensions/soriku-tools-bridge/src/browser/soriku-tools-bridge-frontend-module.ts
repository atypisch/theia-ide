/********************************************************************************
 * Soriku IDE — tools-bridge frontend DI module
 *
 * SPDX-License-Identifier: MIT
 ********************************************************************************/

import { ContainerModule } from '@theia/core/shared/inversify';
import { FrontendApplicationContribution, WebSocketConnectionProvider } from '@theia/core/lib/browser';
import { CommandContribution, PreferenceContribution } from '@theia/core/lib/common';
import { SorikuToolConfirmationService } from './soriku-tool-confirmation-service';
import { SorikuEditorRevealService } from './soriku-editor-reveal-service';
import { SorikuToolApprovalBridge } from './soriku-tool-approval-bridge';
import { SorikuDiffReviewService } from './soriku-diff-review-service';
import { SorikuGeneratedFilesTracker } from './soriku-generated-files-tracker';
import { SorikuCheckpointService } from './soriku-checkpoint-service';
import { SorikuProjectInstructionsService } from './soriku-project-instructions-service';
import { SorikuProjectInstructionsContribution } from './soriku-project-instructions-contribution';
import { SORIKU_SHELL_SERVICE_PATH, SorikuShellService } from '../common/shell-service';
import { sorikuToolsPreferenceSchema } from './soriku-tools-preferences';

export default new ContainerModule(bind => {
    bind(SorikuToolApprovalBridge).toSelf().inSingletonScope();
    bind(SorikuEditorRevealService).toSelf().inSingletonScope();
    bind(SorikuDiffReviewService).toSelf().inSingletonScope();
    bind(SorikuGeneratedFilesTracker).toSelf().inSingletonScope();
    bind(SorikuCheckpointService).toSelf().inSingletonScope();
    bind(SorikuProjectInstructionsService).toSelf().inSingletonScope();
    bind(SorikuProjectInstructionsContribution).toSelf().inSingletonScope();
    bind(FrontendApplicationContribution).toService(SorikuProjectInstructionsContribution);
    bind(CommandContribution).toService(SorikuProjectInstructionsContribution);
    bind(SorikuToolConfirmationService).toSelf().inSingletonScope();
    bind(SorikuShellService).toDynamicValue(ctx =>
        WebSocketConnectionProvider.createProxy(ctx.container, SORIKU_SHELL_SERVICE_PATH),
    ).inSingletonScope();
    bind(PreferenceContribution).toConstantValue({ schema: sorikuToolsPreferenceSchema });
});
