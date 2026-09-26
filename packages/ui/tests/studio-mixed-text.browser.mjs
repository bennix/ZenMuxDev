import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {createServer} from 'vite';
const require=createRequire(import.meta.url);
const {chromium}=require('playwright-core');
const server=await createServer({configFile:false,root:process.cwd(),esbuild:{jsx:'automatic'},server:{port:5201},resolve:{alias:{'@':`${process.cwd()}/packages/ui/src`}}});
await server.listen();
const browser=await chromium.launch({channel:'chrome',headless:true});
try {
 const page=await browser.newPage();await page.goto('http://localhost:5201');
 const result=await page.evaluate(async()=>{
  const {prepareDeckHtml,measureDeckPages,buildEditableDeckPptx}=await import('/packages/ui/src/v4/composer/studio/htmlToEditablePptx.ts');
  const {applyDeckGeometry}=await import('/packages/ui/src/v4/composer/studio/useSlideGeometry.ts');
  const raw='<html><body data-pptx-slide style="margin:0;width:1280px;height:720px"><div data-pptx-kind="shape" data-pptx-id="card" style="position:absolute;left:48px;top:180px;width:500px;height:400px;background:#eee;font-size:28px"><h2>边界测试</h2>模板要求AI列出34.9至42.1预期结果<br>并解释三个边界。<div data-pptx-id="same">措辞约定</div></div><div data-pptx-id="same" data-pptx-kind="text" style="position:absolute;left:640px;top:180px;width:580px;font-size:28px"><b>示例代码</b><br>t = float(input("虚拟体温"))<br>if t &lt; 35.0:<br>　print("超出课堂模拟范围")</div></body></html>';
  const html=prepareDeckHtml(raw.replace('</body>','<div data-pptx-kind="shape" style="position:absolute;left:580px;top:100px;width:0;height:0;border-top:15px solid transparent;border-bottom:15px solid transparent;border-left:20px solid red"></div></body>')),doc=new DOMParser().parseFromString(html,'text/html');
  const ids=[...doc.body.querySelectorAll('[data-pptx-id]')].map(e=>e.dataset.pptxId);
  const text=await measureDeckPages([html]);
  const typography=await measureDeckPages(['<html><body data-pptx-slide style="margin:0;width:1280px;height:720px"><pre data-pptx-kind="text" style="position:absolute;left:40px;top:40px;background:#202020;color:white;font:28px monospace;width:500px;height:150px">if value:\n  print("ok")</pre><div style="position:absolute;left:600px;top:200px;width:250px;font-size:28px"><b>elif</b>处理多个条件分支，<b>else</b>兜底。</div></body></html>']);
  if(!typography[0].nodes.some(n=>n.kind==='shape'&&n.fill==='202020')) throw new Error('Code background lost');
  const lineNodes=typography[0].nodes.filter(n=>n.kind==='text'&&n.noWrap);
  if(lineNodes.length<4 || !lineNodes.some(n=>n.text.includes('print'))) throw new Error('Missing browser line placement');
  const run=doc.querySelector('[data-pptx-text-run]');
  const edited=applyDeckGeometry(raw,[{id:run.dataset.pptxId,properties:{translate:'20px 10px'}}]);
  return {idempotent:html===prepareDeckHtml(html),unique:ids.length===new Set(ids).size,text:text[0].nodes.filter(n=>n.kind==='text').map(n=>n.text).join('\n'),bytes:Array.from(await buildEditableDeckPptx(text)),moved:new DOMParser().parseFromString(edited,'text/html').querySelector(`[data-pptx-id="${run.dataset.pptxId}"]`).style.translate};
 });
 assert.equal(result.idempotent,true);assert.equal(result.unique,true);assert.equal(result.moved,'20px 10px');
 const JSZip=createRequire(require.resolve('pptxgenjs'))('jszip');
 const zip=await JSZip.loadAsync(Uint8Array.from(result.bytes));const xml=await zip.file('ppt/slides/slide1.xml').async('string');
 const exportedText=[...xml.matchAll(/<a:t>(.*?)<\/a:t>/gs)].map(m=>m[1]).join('');
 assert.ok(xml.includes('prst="triangle"'));
 assert.ok(xml.includes('rot="5400000"'));
 for(const token of ['模板要求AI列出34.9至42.1预期结果','并解释三个边界','虚拟体温','超出课堂模拟范围']) {assert.ok(result.text.replace(/\s/gu,'').includes(token.replace(/\s/gu,'')));assert.ok(exportedText.includes(token));}
 assert.equal((result.text.replace(/\s/gu,'').match(/模板要求AI/g)||[]).length,1);
 assert.ok(xml.includes('wrap="none"'));
 console.log('PASS: mixed body/code text retained in editable PPTX XML, stable IDs and geometry writes');
}finally{await browser.close();await server.close();}
