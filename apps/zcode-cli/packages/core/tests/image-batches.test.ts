import assert from "node:assert/strict";
import {test} from "node:test";
import {projectImageBatches} from "../src/runtime/helpers/image-batches.js";
const input=(n:number):any[]=>[{role:"user",content:[{type:"text",text:"比较全部图片"},...Array.from({length:n},(_,i)=>({type:"image",source:{type:"url",url:`https://example.com/${i}.png`}}))]}];
test("51 images are analyzed once each in sequential batches of ten, history intact",async()=>{
 const source=input(51),before=JSON.stringify(source),sizes:number[]=[];
 const result=await projectImageBatches(source,async(content,batch,total)=>{
  assert.equal(batch,sizes.length+1);assert.equal(total,6);
  sizes.push(content.filter(b=>b.type==="image").length);return "facts";
 });
 assert.deepEqual(sizes,[10,10,10,10,10,1]);
 assert.equal(JSON.stringify(source),before);
 assert.equal((result[0]!.content as any[]).filter(b=>b.type==="image").length,0);
});
test("small requests are unchanged; failure and cancellation stop further work",async()=>{
 const small=input(10);assert.equal(await projectImageBatches(small,async()=>{throw Error("must not run");}),small);
 let calls=0;await assert.rejects(projectImageBatches(input(21),async()=>{calls++;throw Error("fixture");}),/fixture/);assert.equal(calls,1);
 const controller=new AbortController();controller.abort();
 await assert.rejects(projectImageBatches(input(21),async()=>{calls++;return "x";},controller.signal));
 assert.equal(calls,1);
});
test("explicit continuation keeps the original image task; new instructions replace it",async()=>{
 const {resolveImageBatchTaskText}=await import("../src/runtime/helpers/image-batches.js");
 const messages:any[]=[{role:"user",content:"比较照片里的标志"},{role:"assistant",content:"已完成第一批"},{role:"user",content:"继续"}];
 assert.equal(resolveImageBatchTaskText(messages),"比较照片里的标志");
 messages.push({role:"user",content:"改成分析颜色"});
 assert.equal(resolveImageBatchTaskText(messages),"改成分析颜色");
});
test("a new query after stop never restarts historical image analysis",async()=>{
 const messages=input(51);
 messages.push({role:"user",content:"PDF 在哪里？"});
 let calls=0;
 const result=await projectImageBatches(messages,async()=>{calls++;return "must not happen";});
 assert.equal(calls,0);
 assert.equal((result[0]!.content as any[]).filter(b=>b.type==="image").length,0);
 assert.equal((messages[0]!.content as any[]).filter(b=>b.type==="image").length,51);
});
