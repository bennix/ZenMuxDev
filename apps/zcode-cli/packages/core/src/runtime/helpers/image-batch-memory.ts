import {createHash} from "node:crypto";
import type {SessionId,SessionStorePort} from "@zcode/contracts";
export const IMAGE_BATCH_ENTRY_TYPE="runtime/image_batch_v1";
type BatchMemory={status:"running"|"completed"|"interrupted";batch:number;total:number;summary?:string};
function parse(value:unknown):BatchMemory|undefined {
 if(!value||typeof value!=="object")return;
 const v=value as Partial<BatchMemory>;
 if(!["running","completed","interrupted"].includes(v.status??"")||!Number.isInteger(v.batch)||!Number.isInteger(v.total))return;
 if(v.status==="completed"&&(typeof v.summary!=="string"||!v.summary.trim()))return;
 return v as BatchMemory;
}
export async function rememberedImageBatch(input:{
 store:SessionStorePort;sessionId:SessionId;fingerprintInput:unknown;batch:number;total:number;
 run:()=>Promise<string>;onRestored:()=>Promise<void>;
}):Promise<string>{
 const {store,sessionId}=input;
 if(!store.saveSessionEntry||!store.sessionEntries) return input.run();
 const fingerprint=createHash("sha256").update(JSON.stringify(input.fingerprintInput)).digest("hex");
 const id=`${sessionId}:image-batch:${fingerprint}`;
 const entries=await store.sessionEntries({sessionID:sessionId,type:IMAGE_BATCH_ENTRY_TYPE});
 const existing=entries.find(entry=>entry.id===id);
 const cached=parse(existing?.data);
 if(cached?.status==="completed"){
  await input.onRestored();
  return cached.summary!;
 }
 const save=async(data:BatchMemory)=>{
  const now=Date.now();
  await store.saveSessionEntry!({id,sessionID:sessionId,type:IMAGE_BATCH_ENTRY_TYPE,touchSession:false,time:{created:existing?.time.created??now,updated:now},data});
 };
 await save({status:"running",batch:input.batch,total:input.total});
 let summary:string;
 try {
  summary=await input.run();
  if(!summary.trim())throw new Error("图片批次未返回分析结果，未记录为完成");
 }catch(error){
  await save({status:"interrupted",batch:input.batch,total:input.total});
  throw error;
 }
 // 修复：先持久化成功结果再推进下一批，重启后不能只记得“已经开始”。
 await save({status:"completed",batch:input.batch,total:input.total,summary});
 return summary;
}
export async function restoreImageBatchMemory(store:SessionStorePort,sessionId:SessionId):Promise<number>{
 if(!store.sessionEntries||!store.saveSessionEntry)return 0;
 const entries=await store.sessionEntries({sessionID:sessionId,type:IMAGE_BATCH_ENTRY_TYPE});
 let completed=0;
 for(const entry of entries){
  const value=parse(entry.data);
  if(value?.status==="completed")completed++;
  if(value?.status==="running")await store.saveSessionEntry({...entry,touchSession:false,time:{...entry.time,updated:Date.now()},data:{...value,status:"interrupted"}});
 }
 return completed;
}
