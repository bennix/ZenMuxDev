import assert from 'node:assert/strict';
import {test} from 'node:test';
import {build} from 'esbuild';
import {chromium} from 'playwright-core';
test('@ open list refreshes files and stops on close',async()=>{
 const bundle=await build({stdin:{contents:`
 import React,{useState} from 'react';import {createRoot} from 'react-dom/client';
 import {MENTION_FILES_ONLY_DEFAULT_PREVIEW_LIMIT} from './packages/ui/src/mentions/mentionSearch.ts';
 import {useFileMentionProvider} from './packages/ui/src/mentions/providers/fileMentionProvider.ts';
 window.files=['old.ts','a.png','b.json','c.pptx','d.pdf','e.png','f.json','g.pptx','h.pptx','i.pptx','build.py','hello.py','workspace.md','last.ts'];window.calls=[];
 function App(){const [enabled,setEnabled]=useState(true);const result=useFileMentionProvider('/work',undefined,'',enabled,'empty','Files',MENTION_FILES_ONLY_DEFAULT_PREVIEW_LIMIT);return <><button onClick={()=>setEnabled(!enabled)}>Toggle</button><output>{result.items.map(x=>x.label).join(',')}</output></>}
 createRoot(document.getElementById('root')).render(<App/>);`,resolveDir:process.cwd(),loader:'tsx'},bundle:true,write:false,platform:'browser',jsx:'automatic',tsconfig:'packages/ui/tsconfig.json',plugins:[{name:'services',setup(b){b.onResolve({filter:/hooks\/useServices\.js$/},()=>({path:'mock',namespace:'mock'}));b.onLoad({filter:/.*/,namespace:'mock'},()=>({contents:`const fileService={searchWorkspaceFiles:async(params)=>{window.calls.push(params);return window.files.slice(0,params.limit).map(name=>({name,type:'file',path:'/work/'+name,relativePath:name}))}};export const useServices=()=>({fileService});`,loader:'js'}))}}]});
 const browser=await chromium.launch({channel:'chrome',headless:true});try{const page=await browser.newPage();await page.setContent('<div id="root"></div>');await page.addScriptTag({content:bundle.outputFiles[0].text});await page.locator('output').filter({hasText:'workspace.md'}).waitFor();assert.equal((await page.locator('output').textContent()).split(',').length,14);assert.equal(await page.evaluate(()=>window.calls[0].refresh),true);
 await page.evaluate(()=>{window.files=['renamed.ts','new.ts']});await page.getByText('renamed.ts,new.ts',{exact:true}).waitFor({timeout:7000});
 await page.getByText('Toggle').click();const count=await page.evaluate(()=>window.calls.length);await page.waitForTimeout(3300);assert.equal(await page.evaluate(()=>window.calls.length),count);
 await page.evaluate(()=>{window.files=['last.ts']});await page.getByText('Toggle').click();await page.getByText('last.ts',{exact:true}).waitFor();
 }finally{await browser.close()}
});
