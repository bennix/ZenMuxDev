import assert from 'node:assert/strict';
import { test } from 'node:test';
import { build } from 'esbuild';
import { chromium } from 'playwright-core';

test('IDE entry opens workbench, bridges selection by workspace and removes obsolete help entries', async () => {
 const bundle = await build({ stdin: { contents: `
 import React from 'react'; import {createRoot} from 'react-dom/client';
 import {WorkspaceCodeWorkbenchButton} from './packages/ui/src/WorkspaceCodeWorkbenchButton.tsx';
 import {WorkspaceHelpMenuButton} from './packages/ui/src/WorkspaceHelpMenuButton.tsx';
 window.addEventListener('zcode:code-comment-add-to-chat', e => { window.context = e.detail; e.preventDefault(); });
 createRoot(document.getElementById('root')).render(<><WorkspaceCodeWorkbenchButton workspacePath="/fixture" remote={false} onOpenUrl={url => window.opened=url}/><WorkspaceHelpMenuButton isDesktop/></>);`, resolveDir: process.cwd(), loader: 'tsx' }, bundle: true, write: false, platform: 'browser', jsx: 'automatic', tsconfig: 'packages/ui/tsconfig.json', plugins: [{ name: 'fixture', setup(b) {
  b.onResolve({filter:/hooks\/usePlatform\.js$/}, () => ({path:'platform',namespace:'fixture'}));
  b.onResolve({filter:/hooks\/useDesktopUpdateMenu\.js$/}, () => ({path:'update',namespace:'fixture'}));
  b.onResolve({filter:/i18n\/IntlProvider\.js$/}, () => ({path:'intl',namespace:'fixture'}));
  b.onResolve({filter:/\/logger\.js$/}, () => ({path:'logger',namespace:'fixture'}));
  b.onResolve({filter:/ControlHintTooltip\.js$/}, () => ({path:'tooltip',namespace:'fixture'}));
  b.onLoad({filter:/.*/,namespace:'fixture'}, ({path}) => ({loader:'js',contents:path==='platform'?`
 const platform={acknowledgeCodeWorkbenchContext:async(requestId,accepted)=>{window.ack={requestId,accepted}},openCodeWorkbench:()=>window.failIDE?Promise.reject(new Error('fixture startup failure')):new Promise(resolve=>window.finish=()=>resolve({url:'http://localhost:1234'})),onCodeWorkbenchContext:callback=>{window.selection=callback;return ()=>{}},executeDesktopCommand:async()=>{}}; export const usePlatform=()=>platform;
 `:path==='update'?`export const useDesktopUpdateMenu=()=>({visible:false});`:path==='intl'?`export const useZCodeIntl=()=>({intl:{formatMessage:({id})=>id}});`:path==='logger'?`export const logger={warn:()=>{}};`:`export const ControlHintTooltip=({children})=>children;`}));
 }}] });
 const browser = await chromium.launch({channel:'chrome',headless:true});
 try {
  const page = await browser.newPage(); await page.setContent('<div id="root"></div>'); await page.addScriptTag({content:bundle.outputFiles[0].text});
  await page.getByTestId('workspace-code-workbench').click();
  assert.equal(await page.getByTestId('workspace-code-workbench').isDisabled(),true);
  await page.evaluate(()=>window.finish()); await page.waitForFunction(()=>window.opened);
  assert.equal(await page.evaluate(()=>window.opened),'http://localhost:1234');
  await page.evaluate(()=>window.selection({workspacePath:'/other',sourcePath:'/other/a.ts',startLine:1,endLine:1,selectedText:'x',comment:'fix'}));
  assert.equal(await page.evaluate(()=>window.context),undefined);
  await page.evaluate(()=>window.selection({requestId:'selection-1',workspacePath:'/fixture',sourcePath:'/fixture/a.ts',startLine:1,endLine:1,selectedText:'x',comment:'fix'}));
  assert.equal(await page.evaluate(()=>window.context.sourceTitle),'a.ts');
  assert.deepEqual(await page.evaluate(()=>window.ack),{requestId:'selection-1',accepted:true});
  await page.evaluate(()=>window.failIDE=true);
  await page.getByTestId('workspace-code-workbench').click();
  await page.getByRole('alert').waitFor();
  assert.equal(await page.getByRole('alert').evaluate(element=>element.parentElement===document.body),true);
  await page.getByRole('button',{name:'workspaceHeader.help.menu'}).click();
  await page.getByRole('menuitem',{name:'titleBar.menu.help.about'}).waitFor();
  for (const name of ['docs','community','issueReport','productRequest']) assert.equal(await page.getByRole('menuitem',{name:'workspaceHeader.help.'+name,exact:true}).count(),0);
 } finally { await browser.close(); }
});
