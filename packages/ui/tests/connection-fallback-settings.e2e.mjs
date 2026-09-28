import assert from 'node:assert/strict';
import {test} from 'node:test';
import {build} from 'esbuild';
import {chromium} from 'playwright-core';

test('fallback model uses model effort options, saves effort and can be disabled', async()=>{
 const bundle=await build({stdin:{contents:`import React from 'react'; import {createRoot} from 'react-dom/client'; import {ConnectionFallbackSettings} from './packages/ui/src/settings/ConnectionFallbackSettings.tsx'; createRoot(document.getElementById('root')).render(<ConnectionFallbackSettings workspacePath="fixture"/>);`,resolveDir:process.cwd(),loader:'tsx'},bundle:true,write:false,platform:'browser',jsx:'automatic',tsconfig:'packages/ui/tsconfig.json',plugins:[{name:'fixtures',setup(b){
 b.onResolve({filter:/hooks\/useSettingService\.js$/},()=>({path:'settings',namespace:'fixture'}));
 b.onResolve({filter:/hooks\/useModelSelectionView\.js$/},()=>({path:'models',namespace:'fixture'}));
 b.onResolve({filter:/i18n\/IntlProvider\.js$/},()=>({path:'intl',namespace:'fixture'}));
 b.onResolve({filter:/thoughtLevelOptions\.js$/},()=>({path:'effort',namespace:'fixture'}));
 b.onResolve({filter:/^@zcode\/provider$/},()=>({path:'provider',namespace:'fixture'}));
 b.onLoad({filter:/.*/,namespace:'fixture'},args=>({loader:'js',resolveDir:process.cwd(),contents:args.path==='effort'?`export const thoughtLevelLabelId = level => level;`:args.path==='settings'?`import {useState} from 'react'; export function useSettings(){ const [settings,set]=useState({}); return {settings,update:async patch=>{window.saved=patch;set(patch)}} }`:args.path==='models'?`export function useModelSelectionView(){return {state:{status:'ready',view:{providers:[{providerId:'test',providerName:'Test',models:[{modelId:'candidate',config:{optionSpecs:{reasoningLevel:{values:['low','high']}}}}]}]}}}}`:args.path==='provider'?`export function completeNewModelSelection(view,selection){return {...selection,options:{reasoningLevel:view.providers[0].models[0].config.optionSpecs.reasoningLevel.values.at(-1)}}}`:`export function useZCodeIntl(){return {intl:{formatMessage:({id})=>id}}}`}));
 }}]});
 const browser=await chromium.launch({channel:'chrome',headless:true});
 try {
 const page=await browser.newPage();await page.setContent('<div id="root"></div>');await page.addScriptTag({content:bundle.outputFiles[0].text});
 await page.getByRole('combobox',{name:'settings.fallback.title'}).selectOption(JSON.stringify(['test','candidate']));
 const effort=page.getByRole('combobox',{name:'settings.fallback.effort'});await effort.waitFor();assert.equal(await effort.inputValue(),'high');
 await effort.selectOption('low');assert.equal(await page.evaluate(()=>window.saved.modelConnectionFallback.options.reasoningLevel),'low');
 await page.getByRole('combobox',{name:'settings.fallback.title'}).selectOption('');assert.equal(await page.evaluate(()=>window.saved.modelConnectionFallback),null);
 }finally{await browser.close()}
});
