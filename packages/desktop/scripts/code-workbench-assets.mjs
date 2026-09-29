export const WORKBENCH_VERSION = "4.139.1";
const checksums = {
  "linux-amd64": "53029be6c5781b7bca49b815fcc9a2a3fc111813ad8c9965b2c0f0d2985a0674",
  "linux-arm64": "0edb4b60d9c4744b2dd14b0911e3c2e6dd8c6f3c13bd58bda23ae744e59e7df1",
  "macos-amd64": "7b3e644460cdc08027d5d305f04117bffd554b6e7983eca568fe3e8048917670",
  "macos-arm64": "be45844038d9c48f012e8a716765dc189432100b6fff801c93ab75ef36dbe8e6",
  "windows-amd64": "bc89bee4caf393cfff7856bf52a815df347cf48bf290339fbbee5314f89c71ab",
};
export function workbenchAsset(platform, arch) {
  const target = `${platform === "darwin" ? "macos" : platform === "win32" ? "windows" : platform}-${arch === "x64" ? "amd64" : arch}`;
  const sha256 = checksums[target];
  if (!sha256) throw new Error(`Unsupported IDE platform: ${platform}/${arch}`);
  return { name: `code-server-${WORKBENCH_VERSION}-${target}`, sha256 };
}
