import { readFile } from "node:fs/promises";
import { join } from "node:path";

export function parseGitHubUpdateRepository(value: unknown): { owner: string; repo: string } | null {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value !== "string" || !/^[A-Za-z0-9-]+\/[A-Za-z0-9_.-]+$/u.test(value) || value.endsWith("/." ) || value.endsWith("/..")) {
    throw new Error("GitHub 更新仓库必须为 owner/repo");
  }
  const [owner, repo] = value.split("/");
  return { owner: owner!, repo: repo! };
}
export async function readGitHubUpdateRepository() {
  try {
    const metadata = JSON.parse(await readFile(join(import.meta.dirname, "../metadata/build-meta.json"), "utf8"));
    return parseGitHubUpdateRepository(metadata.githubUpdateRepository);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}
