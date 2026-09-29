import assert from "node:assert/strict";
import {test} from "node:test";
import {describeWorkbenchExit} from "../src/main/code-workbench/diagnostics.js";
test("startup diagnostics retain exit reason but redact private data",()=>{
 const message=describeWorkbenchExit(1,null,"Cannot load /private/work/a; token=secret123 Authorization: Bearer abc",["/private/work"]);
 assert.match(message,/code=1/); assert.match(message,/Cannot load/);
 assert.doesNotMatch(message,/private\/work|secret123|Bearer abc/);
 assert.match(describeWorkbenchExit(null,"SIGKILL","",[]),/signal=SIGKILL/);
});

test("real child startup failure reports stderr and permits clean retry", async () => {
 const {mkdtemp,mkdir,writeFile,symlink,rm}=await import("node:fs/promises");
 const {tmpdir}=await import("node:os");
 const {join}=await import("node:path");
 const {startWorkbench}=await import("../src/main/code-workbench/process.js");
 const root=await mkdtemp(join(tmpdir(),"ide-exit-test-"));
 try {
  const runtime=join(root,"runtime");
  await mkdir(join(runtime,"lib"),{recursive:true});await mkdir(join(runtime,"out/node"),{recursive:true});
  await symlink(process.execPath,join(runtime,"lib",process.platform==="win32"?"node.exe":"node"));
  await writeFile(join(runtime,"zencode-runtime.json"),JSON.stringify({platform:process.platform,arch:process.arch}));
  await writeFile(join(runtime,"out/node/entry.js"),'process.stderr.write("Fixture startup failure token=secret123\\n");process.exit(77)');
  for(let attempt=0;attempt<2;attempt++) await assert.rejects(startWorkbench({root:join(root,"state"),runtimeDirectory:runtime,request:{workspacePath:root},stateKey:"test",onContext:()=>{}}),error=>{
   assert.match(String(error),/code=77/);assert.match(String(error),/Fixture startup failure/);assert.doesNotMatch(String(error),/secret123/);return true;
  });
 } finally {await rm(root,{recursive:true,force:true})}
});
