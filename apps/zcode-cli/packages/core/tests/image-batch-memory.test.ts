import assert from "node:assert/strict";
import {test} from "node:test";
import {rememberedImageBatch,restoreImageBatchMemory} from "../src/runtime/helpers/image-batch-memory.js";
test("durable completed batches survive a new client; interrupted batches wait for explicit run",async()=>{
 const rows=new Map<string,any>();let calls=0,restored=0;
 const store=()=>({sessionEntries:async()=>[...rows.values()],saveSessionEntry:async(e:any)=>{rows.set(e.id,structuredClone(e));}}) as any;
 const params={sessionId:"fixture" as any,fingerprintInput:{model:"fixture",images:["one"]},batch:1,total:3,run:async()=>{calls++;return "facts";},onRestored:async()=>{restored++;}};
 await rememberedImageBatch({...params,store:store()});
 await restoreImageBatchMemory(store(),"fixture" as any);
 assert.equal(calls,1);
 assert.equal(await rememberedImageBatch({...params,store:store()}),"facts");
 assert.equal(calls,1);assert.equal(restored,1);
 await rememberedImageBatch({...params,store:store(),fingerprintInput:{model:"different"}});
 assert.equal(calls,2);
 rows.set("running",{id:"running",sessionID:"fixture",type:"runtime/image_batch_v1",time:{created:1,updated:1},data:{status:"running",batch:3,total:3}});
 await restoreImageBatchMemory(store(),"fixture" as any);
 assert.equal(rows.get("running").data.status,"interrupted");assert.equal(calls,2);
});
test("a failed completion save is not reported as durable success",async()=>{
 const store:any={sessionEntries:async()=>[],saveSessionEntry:async(e:any)=>{if(e.data.status==="completed")throw Error("disk full");}};
 await assert.rejects(rememberedImageBatch({store,sessionId:"fixture" as any,fingerprintInput:{},batch:1,total:1,run:async()=>"facts",onRestored:async()=>{}}),/disk full/);
});
test("interrupt in batch two, restart and continue reuse batch one",async()=>{
 const {projectImageBatches}=await import("../src/runtime/helpers/image-batches.js");
 const rows=new Map<string,any>(),calls:number[]=[];
 const store:any={sessionEntries:async()=>[...rows.values()],saveSessionEntry:async(e:any)=>{rows.set(e.id,structuredClone(e));}};
 const messages:any[]=[{role:"user",content:[{type:"text",text:"分析全部图片"},...Array.from({length:21},(_,i)=>({type:"image",source:{type:"url",url:`https://example.com/${i}`}}))]}];
 let interrupt=true;
 const run=()=>projectImageBatches(messages,(content,batch,total)=>rememberedImageBatch({
  store,sessionId:"fixture" as any,fingerprintInput:content,batch,total,onRestored:async()=>{},
  run:async()=>{calls.push(batch);if(interrupt&&batch===2)throw Error("interrupted");return `batch ${batch}`;}
 }));
 await assert.rejects(run(),/interrupted/);
 await restoreImageBatchMemory(store,"fixture" as any);
 assert.deepEqual(calls,[1,2]);
 messages.push({role:"user",content:"继续"});
 interrupt=false;
 await run();
 assert.deepEqual(calls,[1,2,2,3]);
});
