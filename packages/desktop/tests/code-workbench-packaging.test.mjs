import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, mkdir, writeFile, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { verifyWorkbenchBundle } from '../scripts/prepare-code-workbench.mjs';
import { workbenchAsset, WORKBENCH_VERSION } from '../scripts/code-workbench-assets.mjs';
test('packaging rejects absent or mismatched IDE assets', async () => {
 const root = await mkdtemp(join(tmpdir(),'ide-bundle-test-'));
 const target = {os:'darwin',arch:'arm64',key:'darwin-arm64'};
 try {
  await assert.rejects(verifyWorkbenchBundle(root,target));
  await mkdir(join(root,'out/node'),{recursive:true}); await mkdir(join(root,'lib'));
  await writeFile(join(root,'out/node/entry.js'),''); await writeFile(join(root,'lib/node'),'');
  const manifest={version:WORKBENCH_VERSION,platform:target.os,arch:target.arch,sha256:workbenchAsset(target.os,target.arch).sha256};
  await writeFile(join(root,'zencode-runtime.json'),JSON.stringify(manifest));
  assert.equal(await verifyWorkbenchBundle(root,target),root);
  await assert.rejects(verifyWorkbenchBundle(root,{os:'darwin',arch:'x64'}),/mismatch/);
 } finally { await rm(root,{recursive:true,force:true}); }
});
test('release and development preparation include IDE, packaged resources contain it', async () => {
 const pkg = JSON.parse(await readFile(new URL('../package.json',import.meta.url),'utf8'));
 assert.ok(pkg.scripts['prepare:code-workbench']);
 const prepare = await readFile(new URL('../scripts/prepare-runtime-assets.mjs',import.meta.url),'utf8');
 const dev = await readFile(new URL('../scripts/ensure-local-runtime-assets.mjs',import.meta.url),'utf8');
 const builder = await readFile(new URL('../electron-builder.config.js',import.meta.url),'utf8');
 assert.match(prepare,/"prepare:code-workbench"/);
 assert.match(dev,/await prepareWorkbench\(target\)/);
 assert.ok(dev.indexOf("await prepareWorkbench(target)") < dev.indexOf("process.exit(0)"));
 assert.match(builder,/await verifyWorkbenchBundle/);
 assert.match(builder,/to: "code-workbench"/);
});
