import assert from "node:assert/strict";
import { test } from "node:test";
import { resolveComputerUseAvailability } from "../src/settings/computerUseAvailability.js";
import { resolveCuaComposerEntryView } from "../src/lib/cuaComposerEntryState.js";
import { supportsLocalLinuxCuaEntry } from "../src/lib/cuaPlatform.js";

test("local Linux desktop offers Computer Use while remote and web remain unavailable", () => {
  assert.deepEqual(resolveComputerUseAvailability({ isDesktop: true }), {
    kind: "local-linux",
    supported: true,
  });
  assert.equal(resolveComputerUseAvailability({ isDesktop: false }).supported, false);
  assert.equal(
    resolveComputerUseAvailability({ isDesktop: true, remoteSessionId: "remote" }).supported,
    false,
  );

  const view = resolveCuaComposerEntryView({
    macLocalDesktop: false,
    windowsLocalDesktop: false,
    linuxLocalDesktop: true,
    hiddenBySettings: false,
    permissionServiceAvailable: false,
    pluginEnabled: true,
    pluginToggling: false,
    pluginError: false,
    permissionStatus: null,
    sessionBusy: false,
  });
  assert.equal(view.visible, true);
  if (view.visible) assert.equal(view.uiState, "idle");
});

test("Linux entry requires the desktop preload and excludes Android", () => {
  const original = Object.getOwnPropertyDescriptor(globalThis, "navigator");
  try {
    Object.defineProperty(globalThis, "navigator", {
      configurable: true,
      value: { userAgent: "ZenCode Electron Linux x86_64" },
    });
    assert.equal(
      supportsLocalLinuxCuaEntry({ executeDesktopCommand: async () => undefined } as never),
      true,
    );
    assert.equal(supportsLocalLinuxCuaEntry(null), false);
    Object.defineProperty(globalThis, "navigator", {
      configurable: true,
      value: { userAgent: "Android Linux" },
    });
    assert.equal(
      supportsLocalLinuxCuaEntry({ executeDesktopCommand: async () => undefined } as never),
      false,
    );
  } finally {
    if (original) Object.defineProperty(globalThis, "navigator", original);
    else Reflect.deleteProperty(globalThis, "navigator");
  }
});
