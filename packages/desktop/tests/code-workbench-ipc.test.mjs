import assert from 'node:assert/strict';
import { test } from 'node:test';
import { build } from 'esbuild';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

test('actual IDE IPC opens development and packaged runtime, returns URL without login', async()=>{
 const directory=await mkdtemp(join(tmpdir(),'ide-ipc-'));
 const bundle=await build({entryPoints:['packages/desktop/src/main/code-workbench/ipc.ts'],bundle:true,write:false,platform:'node',format:'esm',define:{'process.resourcesPath':JSON.stringify('/app/resources')},plugins:[{name:'ports',setup(b){
  b.onResolve({filter:/^electron$/},()=>({path:'electron',namespace:'fixture'}));
  b.onResolve({filter:/browserDataManager\.js$/},()=>({path:'browser',namespace:'fixture'}));
  b.onResolve({filter:/^\.\/process\.js$/},()=>({path:'launch',namespace:'fixture'}));
  b.onLoad({filter:/.*/,namespace:'fixture'},({path})=>({contents:path==='browser'?`export const EMBEDDED_BROWSER_PARTITION='browser';`:path==='launch'?`export async function startWorkbench(options){globalThis.ideCalls.push(options);return {alive:true,origin:'http://127.0.0.1:32123',dispose(){}}}`:`
   export const app={get isPackaged(){return globalThis.idePackaged},getPath:()=>'/data',getAppPath:()=>'/repo/desktop',once(){}};
   export const BrowserWindow={fromWebContents:()=>({id:1,once(){}})};
   export const ipcMain={handle(name,fn){globalThis.ideHandler=fn},on(){},removeListener(){}};
   export const session={fromPartition:()=>({cookies:{set:async cookie=>{globalThis.ideCookie=cookie}}})};
  `}));
 }}]});
 const fetchBefore=globalThis.fetch;
 try {
  const file=join(directory,'ipc.mjs'); await writeFile(file,bundle.outputFiles[0].text);
  const {registerCodeWorkbenchIpc}=await import(pathToFileURL(file).href);
  globalThis.fetch=async()=>{throw new Error('IPC must not make login requests')};
  for(const packaged of [false,true]){
   globalThis.idePackaged=packaged;globalThis.ideCalls=[];
   registerCodeWorkbenchIpc({info(){},warn(){}});
   const result=await globalThis.ideHandler({sender:{isDestroyed:()=>false,send(){}}},{workspacePath:'/workspace'});
   assert.equal(globalThis.ideCalls[0].runtimeDirectory,packaged?'/app/resources/code-workbench':`/repo/desktop/bundled-workbench/${process.platform}-${process.arch}`);
   assert.equal(result.url,'http://127.0.0.1:32123/?folder=%2Fworkspace');
  }
 } finally {globalThis.fetch=fetchBefore;await rm(directory,{recursive:true,force:true});}
});
