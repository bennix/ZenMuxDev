import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';
import { build } from 'esbuild';
import { chromium } from 'playwright-core';
test('IDE fills workspace while original composer docks bottom right without remount', async()=>{
 const result=await build({stdin:{contents:`
 import React,{useState,useEffect} from 'react';import {createRoot} from 'react-dom/client';
 import {ResizablePanelGroup,ResizablePanel,ResizableHandle} from './packages/ui/src/components/ui/resizable.tsx';
 function Composer(){const [text,setText]=useState('');useEffect(()=>{window.mounts=(window.mounts||0)+1},[]);return <input aria-label="AI" value={text} onChange={e=>setText(e.target.value)}/>}
 function App(){const [focus,setFocus]=useState(false);return <><button onClick={()=>setFocus(!focus)}>Toggle IDE</button><div style={{height:700,width:1000}}><ResizablePanelGroup data-code-workbench-focus={focus?'true':undefined} layoutId="fixture-ide" panelIds={['conversation-column','browser']} style={{display:'flex',height:'100%',width:'100%'}}><ResizablePanel id="conversation-column" defaultSize="52%" minSize="35%"><Composer/></ResizablePanel><ResizableHandle data-workspace-side-pane-resize-handle="true"/><ResizablePanel id="browser" defaultSize="48%">IDE</ResizablePanel></ResizablePanelGroup></div></>}
 createRoot(document.getElementById('root')).render(<App/>);`,resolveDir:process.cwd(),loader:'tsx'},bundle:true,write:false,platform:'browser',jsx:'automatic',tsconfig:'packages/ui/tsconfig.json'});
 const browser=await chromium.launch({channel:'chrome',headless:true});
 try {const page=await browser.newPage({viewport:{width:1200,height:850}});await page.route('http://fixture.local/**',route=>route.fulfill({body:'<div id="root"></div>',contentType:'text/html'}));await page.goto('http://fixture.local/');await page.addStyleTag({content:await readFile('packages/ui/src/app-shell/codeWorkbenchLayout.css','utf8')});await page.addScriptTag({content:result.outputFiles[0].text});await page.getByLabel('AI').fill('keep my draft');await page.getByText('Toggle IDE').click();
 const group=await page.locator('[data-code-workbench-focus=true]').boundingBox();const ide=await page.locator('#browser').boundingBox();const dock=await page.locator('#conversation-column').boundingBox();
 assert.ok(Math.abs(group.width-ide.width)<2);assert.ok(dock.width<=440);assert.ok(Math.abs(group.x+group.width-dock.x-dock.width-12)<2);assert.ok(Math.abs(group.y+group.height-dock.y-dock.height-12)<2);
 await page.locator('[data-code-workbench-focus=true]').evaluate(e=>e.setAttribute('data-workbench-dock-collapsed','true'));
 assert.equal(Math.round((await page.locator('#conversation-column').boundingBox()).height),44);
 await page.locator('[data-code-workbench-focus=true]').evaluate(e=>e.removeAttribute('data-workbench-dock-collapsed'));
 assert.equal(await page.getByLabel('AI').inputValue(),'keep my draft');
 assert.equal(await page.getByLabel('AI').count(),1);assert.equal(await page.evaluate(()=>window.mounts),1);
 await page.getByText('Toggle IDE').click();assert.equal(await page.getByLabel('AI').inputValue(),'keep my draft');assert.equal(await page.evaluate(()=>window.mounts),1);
 }finally{await browser.close()}
});
