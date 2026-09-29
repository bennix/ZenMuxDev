import assert from 'node:assert/strict';
import {test} from 'node:test';
import {build} from 'esbuild';
import {chromium} from 'playwright-core';

test('AI send scope transition retains IDE; manual tab choice and workspace isolation remain', async () => {
 const result = await build({stdin:{contents:`
 import React,{useState} from 'react';import {createRoot} from 'react-dom/client';
 import {openBrowserSidePane,resolveSidePaneScopeState} from './packages/ui/src/lib/workspaceSidePane.ts';
 const initial=openBrowserSidePane(null,{tabId:'ide',initialUrl:'http://127.0.0.1:1234',workspaceKey:'w',ownerTaskId:'draft',purpose:'code-workbench'});
 initial.tabs.push({id:'other',type:'browser',workspaceKey:'w',ownerTaskId:'task',initialUrl:'https://example.com'});
 function App(){const [state,setState]=useState(initial);const [scope,setScope]=useState({workspaceKey:'w',ownerTaskId:'draft'});
 const send=()=>{const next={workspaceKey:'w',ownerTaskId:'task'};setScope(next);setState(resolveSidePaneScopeState(state,next,'other').sidePaneState)};
 return <><button onClick={send}>Send AI</button><button onClick={()=>setState({...state,activeTabId:'other'})}>Other tab</button><button onClick={()=>{const next={workspaceKey:'different',ownerTaskId:'task'};setScope(next);setState(resolveSidePaneScopeState(state,next).sidePaneState)}}>Other workspace</button><output>{state?.activeTabId}</output><span>{scope.ownerTaskId}</span></>}
 createRoot(document.getElementById('root')).render(<App/>);`,resolveDir:process.cwd(),loader:'tsx'},bundle:true,write:false,platform:'browser',jsx:'automatic',tsconfig:'packages/ui/tsconfig.json'});
 const browser=await chromium.launch({channel:'chrome',headless:true});
 try {const page=await browser.newPage();await page.setContent('<div id="root"></div>');await page.addScriptTag({content:result.outputFiles[0].text});
 await page.getByText('Send AI',{exact:true}).click();assert.equal(await page.locator('output').textContent(),'ide');
 await page.getByText('Other tab',{exact:true}).click();assert.equal(await page.locator('output').textContent(),'other');
 await page.getByText('Other workspace',{exact:true}).click();assert.equal(await page.locator('output').textContent(),'');
 }finally{await browser.close()}
});
