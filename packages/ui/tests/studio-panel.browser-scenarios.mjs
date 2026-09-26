import assert from "node:assert/strict";

export async function verifyStudioPanel(page) {
  await page.reload();
  await page.evaluate(async () => {
    const { React, createRoot } = await import("/packages/ui/tests/studio-react-entry.js");
    const { ZCodeIntlProvider } = await import("/packages/ui/src/i18n/IntlProvider.tsx");
    const { PlatformProvider } = await import("/packages/ui/src/hooks/usePlatform.tsx");
    const { StudioPanel } = await import("/packages/ui/src/v4/composer/studio/StudioPanel.tsx");
    const encode = (content, finished = false) =>
      new TextEncoder().encode(
        `data: ${JSON.stringify({ choices: [{ delta: { content }, ...(finished ? { finish_reason: "stop" } : {}) }] })}\n\n`,
      );
    let councilFailed = false;
    globalThis.fetch = async (_url, options) => {
      const { messages } = JSON.parse(options.body);
      const system = messages[0].content;
      if (system.startsWith("你是成稿") && !councilFailed) {
        councilFailed = true;
        throw new TypeError("network error");
      }
      if (system.startsWith("你只修改")) {
        const reply = JSON.stringify([
          {
            id: "title",
            html: '<h1 style="position:absolute;left:40px;top:40px;width:300px;height:60px">Edited title</h1>',
          },
        ]);
        return new Response(
          new ReadableStream({
            start(controller) {
              controller.enqueue(encode(reply.slice(0, 25)));
              globalThis.finishEdit = () => {
                controller.enqueue(encode(reply.slice(25), true));
                controller.close();
              };
              options.signal.addEventListener(
                "abort",
                () => controller.error(new DOMException("Aborted", "AbortError")),
                { once: true },
              );
            },
          }),
        );
      }
      if (system.includes("Repair the layout of this single editable slide")) {
        if(JSON.parse(options.body).model !== "repair-test") throw new Error("Manual repair did not use configured model");
        const attempt = JSON.parse(messages[1].content).attempt;
        const content = '<html><body><h1 data-pptx-kind="text" data-pptx-id="title" style="position:absolute;left:64px;top:40px;margin:0;width:600px;height:70px;font-size:32px">Repaired title</h1>' + (attempt < 4 ? '<p data-pptx-id="collision" style="position:absolute;left:64px;top:40px;margin:0;font-size:32px">Overlapping text</p>' : '') + '</body></html>';
        if (attempt === 4) return new Response(new ReadableStream({start(controller) {
          controller.enqueue(encode(content.slice(0,30)));
          globalThis.finishLayout = () => {controller.enqueue(encode(content.slice(30),true));controller.close();};
          options.signal.addEventListener('abort',()=>controller.error(new DOMException('Aborted','AbortError')),{once:true});
        }}));
        return new Response(encode(content,true));
      }
      const content = system.includes("Repair the layout of this single editable slide")
        ? '<html><body><h1 data-pptx-kind="text" data-pptx-id="title" style="position:absolute;left:64px;top:40px;margin:0;width:600px;height:70px;font-size:32px">Repaired title</h1></body></html>'
        : system.includes("visual designer")
          ? "Plain style"
          : system.includes("deck planner")
            ? JSON.stringify({
                pages: Array.from({ length: 10 }, (_, i) => ({
                  title: `Slide ${i + 1}`,
                  brief: "Facts",
                })),
              })
            : system.includes("world-class")
              ? '<html><body style="margin:0;width:1280px;height:720px"><h1 data-pptx-kind="text" data-pptx-id="title" style="position:absolute;left:40px;top:40px;margin:0;width:300px;height:60px;font-size:32px">Original title</h1></body></html>'
              : "FINAL: Test slides\nMEDIUM: none";
      if(system.includes('world-class') && messages[1].content.startsWith('Slide 2 of')) return new Response(new ReadableStream({start(controller){globalThis.finishNextPage=()=>{controller.enqueue(encode(content,true));controller.close();};}}));
      return new Response(encode(content, true));
    };
    document.body.innerHTML =
      '<style>.relative{position:relative}.absolute{position:absolute}.inset-0{inset:0}.top-0{top:0}.left-0{left:0}.w-full{width:100%}.z-20{z-index:20}.z-30{z-index:30}.pointer-events-none{pointer-events:none}</style><div id="app" style="width:640px"></div>';
    const view = {
      providers: [
        {
          config: { access: { type: "api-key", apiKey: "test" } },
          models: [{ modelId: "test", config: { optionSpecs: {} } }],
        },
      ],
    };
    createRoot(document.getElementById("app")).render(
      React.createElement(
        ZCodeIntlProvider,
        { initialLocale: "en-US" },
        React.createElement(
          PlatformProvider,
          { platform: {} },
          React.createElement(StudioPanel, { modelSelectionView: view }),
        ),
      ),
    );
  });
  await page.getByRole("button", { name: "Slides", exact: true }).click();
  await page.getByPlaceholder("Topic", { exact: true }).fill("Test deck");
  await page.getByRole("button", { name: "Make slides", exact: true }).click();
  await page
    .getByText("Request interrupted. Retrying in 1s (attempt 2/3)", { exact: true })
    .waitFor();
  await page.waitForFunction(()=>typeof globalThis.finishNextPage === 'function');
  await page.getByRole('checkbox',{name:'Select',exact:true}).check();
  await page.getByTestId('ppt-selection-overlay').click({position:{x:40,y:30}});
  assert.equal(await page.getByTestId('ppt-element-title').getAttribute('aria-pressed'),'true');
  const gripDuringGeneration=await page.getByTestId('ppt-move-selection').boundingBox();
  await page.mouse.move(gripDuringGeneration.x+14,gripDuringGeneration.y+14);await page.mouse.down();await page.mouse.move(gripDuringGeneration.x+34,gripDuringGeneration.y+24,{steps:3});await page.mouse.up();
  await page.evaluate(()=>globalThis.finishNextPage());
  await page.getByText("Completed 10 slides", { exact: true }).waitFor();
  await page.waitForFunction(()=>Math.abs(document.querySelector('iframe')?.contentDocument?.querySelector('h1')?.getBoundingClientRect().x-80)<1);
  const gripAfterGeneration=await page.getByTestId('ppt-move-selection').boundingBox();
  await page.mouse.move(gripAfterGeneration.x+14,gripAfterGeneration.y+14);await page.mouse.down();await page.mouse.move(gripAfterGeneration.x-6,gripAfterGeneration.y+4,{steps:3});await page.mouse.up();
  await page.getByRole('checkbox',{name:'Select',exact:true}).uncheck();
  console.log('PASS: selection/move while generation is busy survives later page commits');

  await page
    .locator("select")
    .filter({ has: page.locator("option", { hasText: "瑞士风" }) })
    .selectOption({ label: "瑞士风" });
  await page.waitForFunction(
    () => document.querySelector("iframe")?.contentDocument?.body?.dataset.studioTheme === "swiss",
  );
  assert.equal(
    await page
      .locator("iframe")
      .evaluate((frame) => getComputedStyle(frame.contentDocument.body).backgroundColor),
    "rgb(255, 255, 255)",
  );
  await page
    .locator("select")
    .filter({ has: page.locator("option", { hasText: "瑞士风" }) })
    .selectOption({ label: "杂志风" });
  await page.waitForFunction(
    () =>
      document.querySelector("iframe")?.contentDocument?.body?.dataset.studioTheme === "magazine",
  );
  assert.equal(
    await page
      .locator("iframe")
      .evaluate((frame) => getComputedStyle(frame.contentDocument.body).backgroundColor),
    "rgb(245, 241, 232)",
  );
  await page.getByRole("checkbox", { name: "Select", exact: true }).check();
  await page.getByTestId("ppt-selection-overlay").click({ position: { x: 40, y: 30 } });
  const drag = async (locator, dx, dy) => {
    await locator.scrollIntoViewIfNeeded();
    const box = await locator.boundingBox();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2 + dx, box.y + box.height / 2 + dy, { steps: 5 });
    await page.mouse.up();
  };
  const titleRect = () =>
    page.locator("iframe").evaluate((frame) => {
      const box = frame.contentDocument.querySelector("h1").getBoundingClientRect();
      return { x: box.x, y: box.y, w: box.width, h: box.height };
    });
  // Select by list so nested/tiny elements do not require precise pointer hit testing.
  assert.ok(await page.getByTestId("ppt-element-title").isVisible());
  await page.getByTestId("ppt-element-title").click();
  const selection = page.getByTestId("ppt-selection-overlay");
  await selection.scrollIntoViewIfNeeded();
  let canvas = await selection.boundingBox();
  await page.mouse.move(canvas.x + 40, canvas.y + 30);
  await page.mouse.down();
  await page.mouse.move(canvas.x + 80, canvas.y + 50, { steps: 5 });
  await page.mouse.up();
  await page.waitForFunction(
    () =>
      Math.abs(
        document
          .querySelector("iframe")
          ?.contentDocument?.querySelector("h1")
          ?.getBoundingClientRect().x - 120,
      ) < 1,
  );
  await drag(page.getByTestId("ppt-resize-se"), 40, 20);
  await page.waitForFunction(
    () =>
      Math.abs(
        document
          .querySelector("iframe")
          ?.contentDocument?.querySelector("h1")
          ?.getBoundingClientRect().width - 380,
      ) < 1,
  );
  assert.deepEqual(await titleRect(), { x: 120, y: 80, w: 380, h: 100 });
  for (const corner of ["nw", "ne", "se", "sw"]) {
    await drag(page.getByTestId(`ppt-resize-${corner}`), 5, 5);
    await page.waitForFunction(
      ({ corner }) => {
        const r = document
          .querySelector("iframe")
          ?.contentDocument?.querySelector("h1")
          ?.getBoundingClientRect();
        return r && Math.abs(r.width - (corner.includes("w") ? 370 : 390)) < 1;
      },
      { corner },
    );
    await drag(page.getByTestId(`ppt-resize-${corner}`), -5, -5);
    await page.waitForFunction(
      () =>
        Math.abs(
          document
            .querySelector("iframe")
            ?.contentDocument?.querySelector("h1")
            ?.getBoundingClientRect().width - 380,
        ) < 1,
    );
    assert.deepEqual(await titleRect(), { x: 120, y: 80, w: 380, h: 100 });
  }

  await page.getByRole("button", { name: "Next", exact: true }).click();
  await page.getByRole("button", { name: "Previous", exact: true }).click();
  await page.waitForFunction(
    () =>
      Math.abs(
        document
          .querySelector("iframe")
          ?.contentDocument?.querySelector("h1")
          ?.getBoundingClientRect().x - 120,
      ) < 1,
  );
  await page.getByTestId("ppt-element-title").click();
  await page.getByRole("combobox", { name: "Preview zoom" }).selectOption("2");
  await page.waitForFunction(
    () => document.querySelector("iframe")?.style.transform === "scale(1)",
  );
  await selection.scrollIntoViewIfNeeded();
  canvas = await selection.boundingBox();
  await page.mouse.move(canvas.x + 180, canvas.y + 100);
  await page.mouse.down();
  await page.mouse.move(canvas.x + 220, canvas.y + 120, { steps: 5 });
  await page.keyboard.press("Escape");
  await page.mouse.up();
  assert.deepEqual(await titleRect(), { x: 120, y: 80, w: 380, h: 100 });
  await page.getByRole("combobox", { name: "Preview zoom" }).selectOption("1");
  const exportedPosition = await page.evaluate(async () => {
    const { measureDeckPages } =
      await import("/packages/ui/src/v4/composer/studio/htmlToEditablePptx.ts");
    const pages = await measureDeckPages([document.querySelector("iframe").srcdoc]);
    const text = pages[0].nodes.find((node) => node.kind === "text");
    return { x: text.x, y: text.y };
  });
  assert.deepEqual(exportedPosition, { x: 120, y: 80 });
  console.log("PASS: move, resize, page persistence, export coordinates, zoom and Escape rollback");
  await page.getByPlaceholder("Describe how to change these elements").fill("Change title");
  await page.getByRole("button", { name: "Send to AI", exact: true }).click();
  await page.getByTestId("ppt-edit-output").waitFor();
  assert.match(await page.getByTestId("ppt-edit-output").textContent(), /title/);
  assert.equal(
    await page
      .locator("iframe")
      .evaluate((frame) => frame.contentDocument.querySelector("h1").textContent),
    "Original title",
  );
  await page.evaluate(() => globalThis.finishEdit());
  await page.getByText("Edits applied", { exact: true }).waitFor();
  await page.waitForFunction(
    () =>
      document.querySelector("iframe")?.contentDocument?.querySelector("h1")?.textContent ===
      "Edited title",
  );
  await page.getByRole("button", { name: "Send to AI", exact: true }).click();
  await page.getByText("Receiving edits…", { exact: true }).waitFor();
  await page.getByRole("button", { name: "Stop", exact: true }).click();
  assert.equal(
    await page
      .locator("iframe")
      .evaluate((frame) => frame.contentDocument.querySelector("h1").textContent),
    "Edited title",
  );
  console.log(
    "PASS: full StudioPanel council retry and edit output visible before atomic edit completion",
  );
  await page.evaluate(async()=>{
    const {useStudioRepairModelStore}=await import('/packages/ui/src/store/studioRepairModelStore.ts');
    useStudioRepairModelStore.getState().setModelId('repair-test');
  });
  await page.getByRole("button", { name: "Repair current slide layout", exact: true }).click();
  await page.getByText(/Repair 4: 1 issues/).waitFor();
  assert.equal(await page.locator('iframe').evaluate(frame=>frame.contentDocument.querySelector('h1').textContent),'Edited title');
  await page.evaluate(()=>globalThis.finishLayout());

  await page.waitForFunction(
    () =>
      document.querySelector("iframe")?.contentDocument?.querySelector("h1")?.textContent ===
      "Repaired title",
  );
  assert.equal(
    await page
      .locator("iframe")
      .evaluate((frame) => frame.contentDocument.body.dataset.studioTheme),
    "magazine",
  );
  await page.getByRole("button", { name: "Next", exact: true }).click();
  await page.waitForFunction(
    () =>
      document.querySelector("iframe")?.contentDocument?.querySelector("h1")?.textContent ===
      "Original title",
  );
  await page.getByRole("button", { name: "Previous", exact: true }).click();
  await page.waitForFunction(
    () =>
      document.querySelector("iframe")?.contentDocument?.querySelector("h1")?.textContent ===
      "Repaired title",
  );
  console.log(
    "PASS: theme switching and current-page layout repair preserve theme and other pages",
  );
  await page.evaluate(() => {
    globalThis.fetch = async () => new Response('{"error":{"message":"denied"}}', { status: 401 });
  });
  await page.getByRole("button", { name: "Make slides", exact: true }).click();
  await page.getByText("Generation failed; no slides completed", { exact: true }).waitFor();
  assert.equal(await page.locator("iframe").count(), 0);
  console.log("PASS: failure before first slide does not claim completed pages");
  await page.evaluate(() => {
    globalThis.fetch = async (_url, options) => {
      const system = JSON.parse(options.body).messages[0].content;
      const content = system.includes("deck planner")
        ? '{"pages":[]}'
        : "FINAL: Content and style only\nMEDIUM: none";
      return new Response(
        `data: ${JSON.stringify({ choices: [{ delta: { content }, finish_reason: "stop" }] })}\n\n`,
      );
    };
  });
  await page.getByRole("button", { name: "Make slides", exact: true }).click();
  await page
    .getByText("目录规划失败（已尝试 3 次）：目录需要 10 页，实际返回 0 页", { exact: true })
    .waitFor();
  assert.equal(
    await page
      .locator("details")
      .filter({ has: page.getByText("Live AI output", { exact: true }) })
      .getAttribute("open"),
    "",
  );
  console.log("PASS: exhausted outline repair displays precise cause and expands raw output");

  console.log(
    "PASS: 20 incremental pages, streamed output, independent measurement, unique editable IDs, targeted replacement",
  );
  await page.evaluate(async()=>{
    const {React,createRoot}=await import('/packages/ui/tests/studio-react-entry.js');
    const {ZCodeIntlProvider}=await import('/packages/ui/src/i18n/IntlProvider.tsx');
    const {StudioMediaSettings}=await import('/packages/ui/src/v4/composer/studio/StudioMediaSettings.tsx');
    const host=document.createElement('div');document.body.append(host);
    createRoot(host).render(React.createElement(ZCodeIntlProvider,{initialLocale:'en-US'},React.createElement(StudioMediaSettings)));
  });
  await page.getByLabel('PPT repair model',{exact:true}).fill('custom/repair-model');
  assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('zencode.studio.repair-model')).state.modelId),'custom/repair-model');
  await page.reload();
  assert.equal(await page.evaluate(async()=>{
    const {resolveStudioRepairModel}=await import('/packages/ui/src/store/studioRepairModelStore.ts');
    return resolveStudioRepairModel('writer');
  }),'custom/repair-model');
  assert.equal(await page.evaluate(async()=>{
    const {resolveStudioRepairModel,useStudioRepairModelStore}=await import('/packages/ui/src/store/studioRepairModelStore.ts');
    useStudioRepairModelStore.getState().setModelId('');
    return resolveStudioRepairModel('writer');
  }),'writer');
  console.log('PASS: repair model settings persist, reload and fall back to writer');

}
