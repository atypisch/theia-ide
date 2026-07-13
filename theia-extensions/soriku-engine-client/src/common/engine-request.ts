/********************************************************************************
 * Soriku IDE — ChatStreamParams → ChatRequest wire-body mapping (pure)
 *
 * SPDX-License-Identifier: MIT
 ********************************************************************************/

import { ChatRequest, ChatStreamParams } from './engine-types';

/** Maps the widget's stream params onto the engine's `/api/worker` request body. */
export function toChatRequestBody(params: ChatStreamParams): ChatRequest {
    return {
        prompt: params.prompt,
        persona_id: params.personaId,
        conversation_id: params.conversationId,
        project_id: params.projectId,
        mode: params.mode,
        model_id: params.modelId,
        worker_count: params.workerCount,
        worker_models: params.workerModels && params.workerModels.length > 0 ? params.workerModels : undefined,
        tools_enabled: params.toolsEnabled,
        stream: true,
        client_tools: params.clientTools && params.clientTools.length > 0 ? params.clientTools : undefined,
        pilot_tools: params.mode === 'plan' || params.mode === 'single' || params.mode === 'auto' ? true : undefined,
        context: params.context && params.context.length > 0 ? params.context : undefined,
        plan_auto_execute: params.mode === 'plan' ? false : params.planAutoExecute,
        routing_strategy: params.routingStrategy,
        cloud_cost_cap_eur: params.cloudCostCapEur,
        images: params.images && params.images.length > 0 ? params.images : undefined,
        plan_model_id: params.mode === 'plan' ? params.planModelId : undefined,
        plan_models: params.mode === 'plan' && params.planModels && params.planModels.length >= 2 ? params.planModels : undefined,
    };
}
