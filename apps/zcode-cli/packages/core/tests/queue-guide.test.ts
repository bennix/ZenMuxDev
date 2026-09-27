import assert from "node:assert/strict";
import { test } from "node:test";
import { editPendingInputById } from "../src/runtime/methods/steering.js";

test("queued text converts in place to guide with identity, metadata and consumption lock preserved", async () => {
  const item:any={id:"input1",input:"原文",delivery:"queue",commandKind:"sendText",intent:{queueItemId:"input1",sourceCommandId:"original",admittedDelivery:"queue",modelSelection:{providerId:"fixture",modelId:"fixture"}}};
  const events:any[]=[],updates:any[]=[];
  const runtime:any={sessionId:"fixture",activeTurn:{turnId:"turn1",steerable:true,pendingInputs:[item],traceContext:{traceId:"trace"}},pendingInputReservations:new Map(),sessionStore:{updateSessionInputs:async(p:any)=>{assert.equal(runtime.pendingInputReservations.has("input1"),true);updates.push(...p.updates);}},appendEvent:async(e:any)=>{assert.equal(runtime.pendingInputReservations.has("input1"),true);events.push(e);}};
  runtime.editPendingInputById=(p:any)=>editPendingInputById.call(runtime,p);
  assert.equal(await editPendingInputById.call(runtime,{pendingInputId:"input1",newText:"改成中文",delivery:"guide",traceContext:{traceId:"trace"} as any}),true);
  assert.equal(runtime.activeTurn.pendingInputs.length,1);
  assert.equal(item.id,"input1");assert.equal(item.delivery,"guide");assert.equal(item.intent.sourceCommandId,"original");
  assert.equal(updates[0].delivery,"guide");assert.equal(events.length,1);
  assert.equal(events[0].payload.delivery,"guide");assert.equal(runtime.pendingInputReservations.size,0);
});
test("stopped, non-steerable and reserved tasks cannot silently restart through guide",async()=>{
  for(const runtime of [{activeTurn:null},{activeTurn:{steerable:false,pendingInputs:[{id:"i"}]}},{activeTurn:{steerable:true,pendingInputs:[{id:"i"}]},pendingInputReservations:new Map([["i","owner"]])}]) {
    assert.equal(await editPendingInputById.call(runtime as any,{pendingInputId:"i",newText:"text",delivery:"guide",traceContext:{} as any}),false);
  }
});
test("turn ending during persistence does not revive it or publish a false guide",async()=>{
 const updates:any[]=[];const item:any={id:"i",input:"old",delivery:"queue"};
 const runtime:any={sessionId:"s",activeTurn:{steerable:true,pendingInputs:[item]},pendingInputReservations:new Map(),sessionStore:{updateSessionInputs:async(p:any)=>{updates.push(...p.updates);runtime.activeTurn=null;}}};
 assert.equal(await editPendingInputById.call(runtime,{pendingInputId:"i",newText:"new",delivery:"guide",traceContext:{} as any}),false);
 assert.deepEqual(updates.map(x=>x.delivery),["guide","queue"]);assert.equal(item.delivery,"queue");assert.equal(runtime.pendingInputReservations.size,0);
});
