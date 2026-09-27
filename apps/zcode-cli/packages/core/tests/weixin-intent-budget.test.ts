import assert from "node:assert/strict";
import {test} from "node:test";
import {generateWorkspaceText} from "../src/runtime/methods/workspace-generate-text.js";
test("Weixin classifier binds valid budget before generation without changing session selection",async()=>{
 for(const max of [1024,32000]){
  const selection={providerId:"fixture",modelId:"fixture",options:{reasoningLevel:"high"}};
  let bound:any;
  let calls=0;
  const model:any={
   providerId:"fixture",modelId:"fixture",options:{},
   optionSpecs:{maxOutputTokens:{max},reasoningLevel:{values:["low","high"]}},
   bind(options:any){bound=options;return {...model,options};},
   async generateText(request:any){
    const limit=request.options?.maxOutputTokens??bound?.maxOutputTokens;
    assert.ok(Number.isInteger(limit)&&limit>0&&limit<=max,"missing or excessive output budget");
    calls++;return {text:'{"kind":"chat","prompt":"hi","useReference":false}',finishReason:"stop"};
   }
  };
  const telemetry={run:(fn:()=>unknown)=>fn(),setResultType(){},finishCompleted(){},finishFailed(){}};
  const runtime:any={
   config:{},modelFactory:()=>model,rootTraceContext:{traceId:"fixture"},
   agentTelemetry:{detached:()=>telemetry},createEvent:()=>({}),
   appendEvent:async()=>{},createModelStatusSink:()=>undefined,
   extractToolCallsFromResult:()=>[],
  };
  const result=await generateWorkspaceText.call(runtime,{selection,querySource:"weixin-intent",prompt:"hi"});
  assert.equal(calls,1);assert.equal(bound.maxOutputTokens,Math.min(5000,max));
  assert.equal(bound.reasoningLevel,"low");assert.equal(selection.options.reasoningLevel,"high");
  assert.match(result.text,/chat/);
 }
});
