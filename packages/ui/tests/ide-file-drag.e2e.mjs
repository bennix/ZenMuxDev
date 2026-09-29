import assert from 'node:assert/strict';
import {test} from 'node:test';
import {build} from 'esbuild';
import {chromium} from 'playwright-core';

test('IDE drag formats create deduplicated file mentions without uploading', async()=>{
 const bundle=await build({stdin:{contents:`
 import {readWorkspaceFileDragPayloads,hasWorkspaceFileDragPayload} from './packages/ui/src/lib/workspaceFileDrag.ts';
 import {appendWorkspaceFileMentionToComposer} from './packages/ui/src/lib/workspaceFileComposer.ts';
 const target=document.getElementById('composer');let text='';window.mentions=[];
 target.addEventListener('dragover',e=>{if(hasWorkspaceFileDragPayload(e.dataTransfer))e.preventDefault()});
 target.addEventListener('drop',e=>{e.preventDefault();for(const payload of readWorkspaceFileDragPayloads(e.dataTransfer,'/work','local')){text=appendWorkspaceFileMentionToComposer({payload,workspacePath:'/work',workspaceIdentity:'local',currentMarkdown:text,inputApiRef:{current:{appendFileMention:(...args)=>window.mentions.push(args),focus:()=>{}}},onTextChange:value=>{target.textContent=value}})}});
 `,resolveDir:process.cwd(),loader:'ts'},bundle:true,write:false,platform:'browser',tsconfig:'packages/ui/tsconfig.json'});
 const browser=await chromium.launch({channel:'chrome',headless:true});
 try{const page=await browser.newPage();await page.setContent('<div id="composer" contenteditable="true"></div>');await page.addScriptTag({content:bundle.outputFiles[0].text});
 const drop=async(values)=>page.evaluate(values=>{const data=new DataTransfer();for(const [key,value]of Object.entries(values))data.setData(key,value);document.getElementById('composer').dispatchEvent(new DragEvent('drop',{bubbles:true,cancelable:true,dataTransfer:data}))},values);
 await drop({ResourceURLs:JSON.stringify(['file:///work/%E4%B8%AD%E6%96%87%20a.ts','vscode-remote://127.0.0.1:1234/work/b.ts']),CodeFiles:JSON.stringify(['/work/b.ts'])});
 assert.equal(await page.evaluate(()=>window.mentions.length),2);assert.match(await page.locator('#composer').textContent(),/中文 a.ts/);
 await drop({ResourceURLs:JSON.stringify(['file:///work-other/secret','https://example.com/a','file:///work/../secret','file://remote/work/a'])});assert.equal(await page.evaluate(()=>window.mentions.length),2);
 await drop({'application/vnd.code.uri-list':'# comment\r\nfile:///work/c.ts'});assert.equal(await page.evaluate(()=>window.mentions.length),3);
 await drop({CodeFiles:'{bad json'});assert.equal(await page.evaluate(()=>window.mentions.length),3);
 }finally{await browser.close()}
});
