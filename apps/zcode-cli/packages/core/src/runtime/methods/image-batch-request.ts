import {rememberedImageBatch} from "../helpers/image-batch-memory.js";
import {projectImageBatches} from "../helpers/image-batches.js";
import {auxiliaryModelOptions} from "../../model/auxiliary-model-options.js";
import {recordModelUsageFact} from "./usage-observability.js";
import {createChildTraceContext,runWithModelInvocationContext,traceContextToLogContext} from "../deps.js";
import type {ModelInputMessage} from "../deps.js";
import type {AgentRuntimeInternal} from "../internal.js";
import type {RunModelTextRequestOptions} from "../types.js";
import {projectMessagesForMediaBudget} from "../helpers/media-budget.js";
import {createModelStreamingEventQueue} from "./model-streaming-event-queue.js";
import {resolveModelRequestSessionTypeFromTaskType} from "./model-request-session-type.js";
import {createRefreshRuntimeHeadersBeforeModelAttempt} from "./model-runtime-headers.js";
import {isOutputTokenLimitFinishReason} from "./turn-output-token-continuation.js";
export async function prepareImageBatchMessages(this:AgentRuntimeInternal,messages:ModelInputMessage[],options:RunModelTextRequestOptions):Promise<ModelInputMessage[]> {
 const model=options.model;
  return await projectImageBatches(messages, async (content,batch,total) => {
    const run=async()=>{
    const progress=createModelStreamingEventQueue({events:options.events,runtime:this,traceContext:options.traceContext});
    progress.enqueue({assistantMessageId:options.assistantMessageId,kind:"text_delta",delta:`正在分析图片：第 ${batch}/${total} 批（每批最多 10 张）。\n`,done:false});
    await progress.drain();
    const batchModel=model.bind(auxiliaryModelOptions(model));
    const traceContext=createChildTraceContext(options.traceContext,{attributes:{querySource:"image_batch",batch}});
    const startedAt=Date.now();
    const batchMessages=projectMessagesForMediaBudget([{role:"user",content}],{latestRealUserMessageIndex:0}).messages;
    const events: typeof options.events = [];
    try {
      const result=await runWithModelInvocationContext({
        traceContext,metadata:traceContextToLogContext(traceContext),
        modelRequestSessionType:resolveModelRequestSessionTypeFromTaskType(this.config.taskType),
        modelCall:{operation:"workspace_generate_text"},
        statusSink:this.createModelStatusSink(traceContext,events),
        refreshRuntimeHeadersBeforeAttempt:createRefreshRuntimeHeadersBeforeModelAttempt(this,{abortSignal:options.abortSignal,model:batchModel,traceContext}),
      },()=>batchModel.generateText({messages:batchMessages,abortSignal:options.abortSignal}));
      if(isOutputTokenLimitFinishReason(result.finishReason, undefined)) throw new Error(`第 ${batch}/${total} 批图片分析被截断，请减少单批图片内容后重试`);
      await recordModelUsageFact(this,{events,model:batchModel,networkEventStartIndex:0,querySource:"image_batch",result,startedAt,status:"completed",traceContext});
      return result.text;
    }catch(error){
      await recordModelUsageFact(this,{events,model:batchModel,networkEventStartIndex:0,querySource:"image_batch",error,startedAt,status:"error",traceContext});
      throw error;
    }
    };
    if(!this.sessionPersisted||!this.sessionStore)return run();
    return rememberedImageBatch({
      store:this.sessionStore,sessionId:this.sessionId,batch,total,
      fingerprintInput:{version:1,provider:model.providerId,model:model.modelId,options:auxiliaryModelOptions(model),content},
      run,
      onRestored:async()=>{
        const progress=createModelStreamingEventQueue({events:options.events,runtime:this,traceContext:options.traceContext});
        progress.enqueue({assistantMessageId:options.assistantMessageId,kind:"text_delta",delta:`已恢复第 ${batch}/${total} 批图片的分析结果，无需重复处理。\n`,done:false});
        await progress.drain();
      },
    });
  },options.abortSignal);
}
