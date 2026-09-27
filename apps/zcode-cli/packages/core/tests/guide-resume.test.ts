import assert from "node:assert/strict";
import {test} from "node:test";
import {restorePersistedPendingInputs} from "../src/runtime/methods/steering.js";
test("restart restores text guidance as held, preserves identity and does not execute",async()=>{
 const held:any[]=[],discarded:string[]=[];
 const records=[
 {id:"guide1",kind:"sendText",delivery:"guide",admittedSequence:1,payload:{text:"改成中文",intent:{queueItemId:"guide1",sourceCommandId:"source1",modelSelection:{providerId:"p",modelId:"m"}}}},
 {id:"queue1",kind:"sendText",delivery:"queue",admittedSequence:2,payload:{text:"old queue"}},
 ];
 const runtime:any={sessionId:"fixture",sessionStore:{listSessionInputs:async()=>records,settleSessionInput:async(v:any)=>{discarded.push(v.id);}},rebuildProjection:async()=>({pendingSteerInputs:[]}),enqueueDeferredInput:async(v:any)=>{held.push(v);},logger:{warn(){}}};
 const count=await restorePersistedPendingInputs.call(runtime,{traceId:"fixture"} as any);
 assert.equal(count,1);assert.deepEqual(discarded,["queue1"]);
 assert.equal(held[0].input,"改成中文");assert.equal(held[0].pendingInputId,"guide1");
 assert.equal(held[0].delivery,"guide");assert.equal(held[0].intent.sourceCommandId,"source1");
});
test("a storage read failure stops resume instead of silently losing guides",async()=>{
 const runtime:any={sessionId:"fixture",sessionStore:{listSessionInputs:async()=>{throw Error("storage unavailable");}},logger:{warn(){}}};
 await assert.rejects(restorePersistedPendingInputs.call(runtime,{traceId:"fixture"} as any),/storage unavailable/);
});
