import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { createServer } from 'vite';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright-core');
const server = await createServer({configFile:false,root:process.cwd(),server:{port:5199},resolve:{alias:{"@":`${process.cwd()}/packages/ui/src`}}});
await server.listen();
const browser = await chromium.launch({channel:'chrome',headless:true});
try {
  const page = await browser.newPage();
  await page.goto('http://localhost:5199');
  const result = await page.evaluate(async () => {
    const { streamStudioChat } = await import('/packages/ui/src/v4/composer/studio/studioChatRetry.ts');
    const sse = (text, end=true) => new Response(`data: ${JSON.stringify({choices:[{delta:{content:text}}]})}\n\n${end ? 'data: [DONE]\n\n' : ''}`);
    const run = async (fetchImpl, cancel=false) => {
      let calls=0, content='';
      const retries=[];
      const controller=new AbortController();
      let failed=false;
      try { await streamStudioChat({apiKey:'test',model:'test',messages:[],requireComplete:true,signal:controller.signal,
        fetchImpl:async () => fetchImpl(++calls),onAttempt:()=>{content='';},onDelta:delta=>{content+=delta;},
        onRetry:retry=>{retries.push(retry);if(cancel)controller.abort();}}); }
      catch {failed=true;}
      return {calls,content,retries,failed};
    };
    const truncated=await run(call=>sse(call===1?'discard this partial HTML':'complete page',call!==1));
    const network=await run(call=>{if(call===1)throw new TypeError('network error');return sse('complete');});
    const denied=await run(()=>new Response('{"error":{"message":"denied"}}',{status:401}));
    const exhausted=await run(()=>new Response('unavailable',{status:503}));
    const cancelled=await run(()=>new Response('busy',{status:429,headers:{'Retry-After':'2'}}),true);
    return {truncated,network,denied,exhausted,cancelled};
  });
  assert.equal(result.truncated.calls,2);
  assert.equal(result.truncated.content,'complete page');
  assert.equal(result.network.calls,2);
  assert.equal(result.network.failed,false);
  assert.equal(result.denied.calls,1);
  assert.equal(result.denied.failed,true);
  assert.equal(result.exhausted.calls,3);
  assert.equal(result.exhausted.failed,true);
  assert.equal(result.cancelled.calls,1);
  assert.equal(result.cancelled.retries[0].delayMs,2000);
  console.log('PASS: truncated stream reset, network retry, auth no retry, 3-attempt cap, Retry-After, cancellable backoff');
} finally { await browser.close(); await server.close(); }
