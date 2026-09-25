/* oxlint-disable eslint(max-lines) -- 工作区同时承载名单、白板、附件和流式输出。 */
/**
 * 对话框里的多 Agent 工作区。模型来自当前设置，流式调用 ZenMux，可取消。
 */
import { useMemo, useRef, useState } from "react";
import { isApiKeyAccess } from "@zcode/provider";
import type { ModelSelectionView } from "@zcode/services";
import {
  ZENMUX_SYSTEM_ONE_MODEL_ID,
  clampDuckDuckGoQuery,
  completeZenMuxChat,
  formatDuckDuckGoHits,
  normalizeDuckDuckGoHits,
  streamZenMuxChatCompletion,
  type DuckDuckGoHit,
  type ZenMuxChatContentPart,
  type ZenMuxChatMessage,
} from "@zcode/shared";
import { MessageResponse } from "@/components/ai-elements/message.js";
import { Button } from "@/components/ui/button.js";
import { cn } from "@/components/lib/utils.js";
import { usePlatform } from "@/hooks/usePlatform.js";
import { useZCodeIntl } from "@/i18n/IntlProvider.js";

const STORAGE_KEY = "zencode.workspace.board.v1";
const MAX_AGENTS = 5;

type Stance = "collaborate" | "critique";

interface AgentDraft {
  readonly id: string;
  readonly name: string;
  readonly modelKey: string;
  readonly stance: Stance;
  readonly effort: string;
}

interface BoardDraft {
  readonly agents: readonly AgentDraft[];
  readonly judgeModelKey: string;
  readonly judgeEffort: string;
  readonly whiteboardOn: boolean;
  readonly whiteboard: string;
}

interface ModelChoice {
  readonly key: string;
  readonly modelId: string;
  readonly label: string;
  readonly efforts: readonly string[];
}

interface BoardImage {
  readonly id: string;
  readonly name: string;
  readonly url: string;
}

function loadDraft(): Partial<BoardDraft> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Partial<BoardDraft>;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function saveDraft(draft: BoardDraft) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(draft));
  } catch {
    // 配置写不进本地时，这一次运行仍然继续。
  }
}

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(reader.error ?? new Error("read failed"));
    reader.readAsDataURL(file);
  });
}

function defaultEffort(efforts: readonly string[]): string {
  if (efforts.includes("medium")) return "medium";
  return efforts.at(-1) ?? "";
}

function resolveEffort(effort: string, efforts: readonly string[]): string {
  if (effort && efforts.includes(effort)) return effort;
  return defaultEffort(efforts);
}

function supportedEfforts(modelId: string, efforts: readonly string[]): readonly string[] {
  const blocked = /gpt-6-astra/iu.test(modelId)
    ? new Set(["minimal", "none"])
    : /gpt-6-sol/iu.test(modelId)
      ? new Set(["minimal"])
      : null;
  return blocked ? efforts.filter((effort) => !blocked.has(effort)) : efforts;
}

function reasoningBody(modelId: string, effort: string): Record<string, unknown> | undefined {
  const level = /gpt-6-astra/iu.test(modelId) && (effort === "minimal" || effort === "none")
    ? "medium"
    : /gpt-6-sol/iu.test(modelId) && effort === "minimal"
      ? "medium"
      : effort;
  if (!level) return undefined;
  if (/claude|anthropic\//iu.test(modelId)) {
    const budget = level === "low" || level === "minimal" ? 4000 : level === "high" ? 24000 : 10000;
    return { thinking: { type: "enabled", budget_tokens: budget } };
  }
  if (/gemini-3/iu.test(modelId)) return { thinking_level: level.toUpperCase() };
  if (/gemini/iu.test(modelId)) {
    const budget = level === "low" || level === "minimal" ? 4000 : level === "high" ? 24000 : 10000;
    return { thinking_budget: budget };
  }
  return { reasoning_effort: level };
}

function modelChoices(view: ModelSelectionView | null): readonly ModelChoice[] {
  if (!view) return [];
  return view.providers.flatMap((provider) =>
    provider.models
      .filter((model) => model.modelId !== ZENMUX_SYSTEM_ONE_MODEL_ID)
      .map((model) => ({
        key: `${provider.providerId}\n${model.modelId}`,
        modelId: model.modelId,
        label: model.modelId,
        efforts: supportedEfforts(model.modelId, model.config.optionSpecs.reasoningLevel.values),
      })),
  );
}

function WorkspaceMarkdown({ text, streaming }: { text: string; streaming: boolean }) {
  return (
    <div className="mt-2 max-h-96 overflow-auto">
      <MessageResponse streaming={streaming} className="min-w-0 text-foreground">
        {text}
      </MessageResponse>
    </div>
  );
}

function discussionMarkdown(input: {
  task: string;
  searchLog: ReadonlyArray<{ query: string; hits: readonly DuckDuckGoHit[] }>;
  sections: ReadonlyArray<{ title: string; body: string }>;
}): string {
  const parts = [`# ${input.task.trim() || "讨论"}`];
  if (input.searchLog.length > 0) {
    const searches = input.searchLog.map((entry) => {
      const hits =
        entry.hits.length === 0
          ? "- 没有结果"
          : entry.hits.map((hit) => `- [${hit.title}](${hit.url})\n  ${hit.snippet}`).join("\n");
      return `### ${entry.query}\n\n${hits}`;
    });
    parts.push(`## 检索\n\n${searches.join("\n\n")}`);
  }
  for (const section of input.sections) {
    if (!section.body.trim()) continue;
    parts.push(`## ${section.title}\n\n${section.body.trim()}`);
  }
  return `${parts.join("\n\n")}\n`;
}

function readSearchQuery(raw: string): string {
  try {
    const parsed = JSON.parse(raw) as { query?: unknown };
    return typeof parsed.query === "string" ? clampDuckDuckGoQuery(parsed.query) : "";
  } catch {
    return "";
  }
}

const MAX_SEARCH_QUERIES = 8;

/** 股票、经济和气候数据由模型拆成逐项检索词，避免一次搜多个标的。 */
function readPlannedQueries(content: string): string[] {
  const start = content.indexOf("{");
  const end = content.lastIndexOf("}");
  if (start === -1 || end <= start) return [];
  try {
    const parsed = JSON.parse(content.slice(start, end + 1)) as { queries?: unknown };
    if (!Array.isArray(parsed.queries)) return [];
    const queries: string[] = [];
    for (const item of parsed.queries) {
      if (typeof item !== "string") continue;
      const query = clampDuckDuckGoQuery(item);
      if (!query || queries.includes(query)) continue;
      queries.push(query);
      if (queries.length >= MAX_SEARCH_QUERIES) break;
    }
    return queries;
  } catch {
    return [];
  }
}

async function collectDuckDuckGoContext(input: {
  apiKey: string;
  model: string;
  task: string;
  signal: AbortSignal;
  search: (query: string) => Promise<readonly DuckDuckGoHit[]>;
}): Promise<string> {
  const queries: string[] = [];
  if (input.model) {
    try {
      const planned = await completeZenMuxChat({
        apiKey: input.apiKey,
        model: input.model,
        messages: [
          {
            role: "system",
            content:
              '把需要查的当前数值拆成逐条谷歌检索词。股票、汇率、利率、通胀、气候等必须一项一条，禁止把多个标的写进同一条。每条都要能查出一个数字，例如 "SCHD stock price"、"GOOGL stock price"。只输出 JSON：{"queries":["..."]}，最多 8 条，不要写正文。',
          },
          { role: "user", content: input.task.slice(0, 1200) },
        ],
        signal: input.signal,
      });
      queries.push(...readPlannedQueries(planned.content));
      for (const call of planned.toolCalls) {
        if (call.name !== "duckduckgo_search" || queries.length >= MAX_SEARCH_QUERIES) continue;
        const query = readSearchQuery(call.arguments);
        if (query && !queries.includes(query)) queries.push(query);
      }
    } catch {
      // 模型不接受工具调用时，改用任务原文检索。
    }
  }
  if (queries.length === 0) {
    const fallback = clampDuckDuckGoQuery(input.task);
    if (fallback) queries.push(fallback);
  }
  const sections: string[] = [];
  for (const query of queries) {
    if (input.signal.aborted) break;
    const hits = normalizeDuckDuckGoHits(await input.search(query));
    sections.push(`### ${query}\n${formatDuckDuckGoHits(hits)}`);
  }
  return sections.join("\n\n");
}

function readApiKey(view: ModelSelectionView | null): string {
  for (const provider of view?.providers ?? []) {
    const access = provider.config.access;
    if (isApiKeyAccess(access) && access.apiKey?.trim()) return access.apiKey.trim();
  }
  return "";
}

export function WorkspaceAgentBoard({
  modelSelectionView,
}: {
  modelSelectionView: ModelSelectionView | null;
}) {
  const { intl } = useZCodeIntl();
  const platform = usePlatform();
  const choices = useMemo(() => modelChoices(modelSelectionView), [modelSelectionView]);
  const apiKey = readApiKey(modelSelectionView);
  const stored = useMemo(() => loadDraft(), []);
  const firstKey = choices[0]?.key ?? "";
  const [agents, setAgents] = useState<AgentDraft[]>(() => {
    const saved = stored.agents?.filter((agent) => agent && typeof agent.id === "string") ?? [];
    if (saved.length > 0) return saved.slice(0, MAX_AGENTS);
    return [
      {
        id: "agent-1",
        name: "Agent 1",
        modelKey: firstKey,
        stance: "collaborate",
        effort: defaultEffort(choices[0]?.efforts ?? []),
      },
    ];
  });
  const [judgeModelKey, setJudgeModelKey] = useState(stored.judgeModelKey || firstKey);
  const [judgeEffort, setJudgeEffort] = useState(stored.judgeEffort ?? "");
  const [whiteboardOn, setWhiteboardOn] = useState(stored.whiteboardOn === true);
  const [whiteboard, setWhiteboard] = useState(stored.whiteboard ?? "");
  const [task, setTask] = useState("");
  const [images, setImages] = useState<BoardImage[]>([]);
  const [notes, setNotes] = useState<string[]>([]);
  const [outputs, setOutputs] = useState<Record<string, string>>({});
  const [running, setRunning] = useState(false);
  const [searchStatus, setSearchStatus] = useState<string | null>(null);
  const [searchLog, setSearchLog] = useState<Array<{ query: string; hits: readonly DuckDuckGoHit[] }>>(
    [],
  );
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const liveBoard = useMemo(() => {
    const parts: string[] = [];
    if (whiteboardOn && whiteboard.trim()) parts.push(whiteboard.trim());
    for (const agent of agents) {
      const body = outputs[agent.id]?.trim();
      if (body) parts.push(`### ${agent.name}\n\n${body}`);
    }
    const verdict = outputs.judge?.trim();
    if (verdict) {
      parts.push(`### ${intl.formatMessage({ id: "chat.workspace.judge" })}\n\n${verdict}`);
    }
    return parts.join("\n\n");
  }, [agents, intl, outputs, whiteboard, whiteboardOn]);

  const persist = (next: Partial<BoardDraft> & { agents?: AgentDraft[] }) => {
    saveDraft({
      agents: next.agents ?? agents,
      judgeModelKey: next.judgeModelKey ?? judgeModelKey,
      judgeEffort: next.judgeEffort ?? judgeEffort,
      whiteboardOn: next.whiteboardOn ?? whiteboardOn,
      whiteboard: next.whiteboard ?? whiteboard,
    });
  };

  const choiceByKey = (key: string) => choices.find((choice) => choice.key === key) ?? choices[0];

  const addFiles = async (files: readonly File[]) => {
    const nextImages: BoardImage[] = [];
    const nextNotes: string[] = [];
    for (const file of files) {
      if (file.type.startsWith("image/")) {
        const url = await fileToDataUrl(file);
        nextImages.push({ id: `${file.name}-${Date.now()}`, name: file.name, url });
      } else {
        nextNotes.push(`${file.name}\n${await file.text()}`);
      }
    }
    if (nextImages.length > 0) setImages((current) => [...current, ...nextImages]);
    if (nextNotes.length > 0) setNotes((current) => [...current, ...nextNotes]);
  };

  const run = async () => {
    if (!apiKey || !task.trim() || choices.length === 0) return;
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setRunning(true);
    setError(null);
    setSearchStatus(null);
    setSearchLog([]);
    setOutputs({});
    const noteText = notes.length > 0 ? `\n\n${notes.join("\n\n")}` : "";
    const boardText = whiteboardOn && whiteboard.trim() ? `\n\n共享白板：\n${whiteboard.trim()}` : "";
    const boardRule = boardText
      ? "共享白板是用户给定的约束和已知条件，必须遵守，并在发言里直接用到。白板上的数字按用户给定处理，不要用检索摘要替换，也不要略过。"
      : "";
    const imageParts: ZenMuxChatContentPart[] = images.map((image) => ({
      type: "image_url",
      image_url: { url: image.url },
    }));
    const spoken: string[] = [];
    try {
      const searchContext = await collectDuckDuckGoContext({
        apiKey,
        model: choiceByKey(agents[0]?.modelKey ?? "")?.modelId ?? "",
        task: task.trim(),
        signal: controller.signal,
        search: async (query) => {
          setSearchStatus(query);
          const found = (await platform.searchDuckDuckGo?.(query)) ?? [];
          setSearchLog((current) => [...current, { query, hits: found }]);
          return found;
        },
      });
      setSearchStatus(null);
      const evidence = `\n\n谷歌检索摘要：\n${searchContext}`;
      for (const agent of agents) {
        if (controller.signal.aborted) return;
        const choice = choiceByKey(agent.modelKey);
        if (!choice) continue;
        const prior = spoken.length > 0 ? `\n\n已有发言：\n${spoken.join("\n\n")}` : "";
        const text = `${task.trim()}${noteText}${evidence}${prior}${boardText}`;
        const content: ZenMuxChatMessage["content"] =
          imageParts.length > 0 ? [{ type: "text", text }, ...imageParts] : text;
        const stance =
          agent.stance === "critique"
            ? "你负责挑刺：指出漏洞、漏掉的情况和错误假设。"
            : "你负责合作推进：给出可执行的结论。";
        let acc = "";
        await streamZenMuxChatCompletion({
          apiKey,
          model: choice.modelId,
          messages: [
            {
              role: "system",
              content: `你是 ${agent.name}。${stance}直接写结论。价格、分红、日期和新闻只能引用谷歌检索摘要；摘要里没有的数字要写明检索没有给出，不要用记忆里的旧数据冒充当前事实。${boardRule}`,
            },
            { role: "user", content },
          ],
          reasoning: reasoningBody(choice.modelId, resolveEffort(agent.effort, choice.efforts)),
          signal: controller.signal,
          onDelta: (delta) => {
            acc += delta;
            setOutputs((current) => ({ ...current, [agent.id]: acc }));
          },
        });
        spoken.push(`${agent.name}：\n${acc}`);
      }
      if (controller.signal.aborted) return;
      const judge = choiceByKey(judgeModelKey);
      if (!judge) return;
      let judgeText = "";
      const summary = `${task.trim()}${noteText}${evidence}\n\n${spoken.join("\n\n")}${boardText}`;
      const judgeContent: ZenMuxChatMessage["content"] =
        imageParts.length > 0 ? [{ type: "text", text: summary }, ...imageParts] : summary;
      await streamZenMuxChatCompletion({
        apiKey,
        model: judge.modelId,
        messages: [
          {
            role: "system",
            content:
              `你是验收裁定。根据任务、谷歌检索摘要和各位 Agent 的发言，给出是否通过、必须修改的点，以及最终结论。摘要里没有的当前数字不能算作已核实。${boardRule}`,
          },
          { role: "user", content: judgeContent },
        ],
        reasoning: reasoningBody(judge.modelId, resolveEffort(judgeEffort, judge.efforts)),
        signal: controller.signal,
        onDelta: (delta) => {
          judgeText += delta;
          setOutputs((current) => ({ ...current, judge: judgeText }));
        },
      });
    } catch (runError) {
      if (controller.signal.aborted) return;
      setError(runError instanceof Error ? runError.message : String(runError));
    } finally {
      if (abortRef.current === controller) {
        setRunning(false);
        setSearchStatus(null);
      }
    }
  };

  return (
    <section className="mb-3 rounded-2xl border border-border bg-card p-3 text-foreground">
      <div className="mb-2 flex items-center justify-between gap-2">
        <div>
          <h2 className="text-ui-base font-medium">{intl.formatMessage({ id: "chat.workspace.title" })}</h2>
          <p className="text-ui-caption text-muted-foreground">
            {searchStatus
              ? intl.formatMessage({ id: "chat.workspace.searching" }, { query: searchStatus })
              : intl.formatMessage({ id: "chat.workspace.hint" })}
          </p>
        </div>
        <Button
          type="button"
          variant="ghost"
          className="h-7 px-2 text-ui-caption"
          disabled={agents.length >= MAX_AGENTS || running}
          onClick={() => {
            const next = [
              ...agents,
              {
                id: `agent-${Date.now()}`,
                name: `Agent ${agents.length + 1}`,
                modelKey: firstKey,
                stance: "collaborate" as const,
                effort: defaultEffort(choices[0]?.efforts ?? []),
              },
            ];
            setAgents(next);
            persist({ agents: next });
          }}
        >
          {intl.formatMessage({ id: "chat.workspace.add" })}
        </Button>
      </div>
      {searchLog.length > 0 ? (
        <div className="mb-2 flex flex-col gap-2">
          {searchLog.map((entry) => (
            <div key={entry.query} className="rounded-xl border border-border bg-surface p-2">
              <p className="text-ui-caption text-muted-foreground">{entry.query}</p>
              {entry.hits.length === 0 ? (
                <p className="text-ui-caption">{intl.formatMessage({ id: "chat.workspace.searchEmpty" })}</p>
              ) : (
                entry.hits.map((hit) => (
                  <button
                    key={`${entry.query}-${hit.url}`}
                    type="button"
                    className="mt-1 block w-full text-left"
                    onClick={() => platform.openExternal(hit.url)}
                  >
                    <span className="text-ui-caption text-foreground">{hit.title}</span>
                    <span className="mt-0.5 block text-ui-caption text-muted-foreground">{hit.snippet}</span>
                  </button>
                ))
              )}
            </div>
          ))}
        </div>
      ) : null}
      {!apiKey ? (
        <p className="mb-2 text-ui-caption text-warning">
          {intl.formatMessage({ id: "chat.workspace.noKey" })}
        </p>
      ) : null}
      {choices.length === 0 ? (
        <p className="mb-2 text-ui-caption text-muted-foreground">
          {intl.formatMessage({ id: "chat.workspace.noModel" })}
        </p>
      ) : null}
      <div className="flex flex-col gap-2">
        {agents.map((agent) => {
          const efforts = choiceByKey(agent.modelKey)?.efforts ?? [];
          return (
            <div key={agent.id} className="rounded-xl border border-border bg-surface p-2">
              <div className="flex flex-wrap items-center gap-2">
                <input
                  value={agent.name}
                  onChange={(event) => {
                    const next = agents.map((item) =>
                      item.id === agent.id ? { ...item, name: event.target.value } : item,
                    );
                    setAgents(next);
                    persist({ agents: next });
                  }}
                  className="h-7 w-28 rounded-lg border border-border bg-background px-2 text-ui-caption"
                />
                <select
                  value={agent.modelKey}
                  onChange={(event) => {
                    const modelKey = event.target.value;
                    const effort = defaultEffort(
                      choices.find((choice) => choice.key === modelKey)?.efforts ?? [],
                    );
                    const next = agents.map((item) =>
                      item.id === agent.id ? { ...item, modelKey, effort } : item,
                    );
                    setAgents(next);
                    persist({ agents: next });
                  }}
                  className="h-7 max-w-full flex-1 rounded-lg border border-border bg-background px-2 text-ui-caption"
                >
                  {choices.map((choice) => (
                    <option key={choice.key} value={choice.key}>
                      {choice.label}
                    </option>
                  ))}
                </select>
                <select
                  value={agent.stance}
                  onChange={(event) => {
                    const stance: Stance = event.target.value === "critique" ? "critique" : "collaborate";
                    const next = agents.map((item) =>
                      item.id === agent.id ? { ...item, stance } : item,
                    );
                    setAgents(next);
                    persist({ agents: next });
                  }}
                  className="h-7 rounded-lg border border-border bg-background px-2 text-ui-caption"
                >
                  <option value="collaborate">
                    {intl.formatMessage({ id: "chat.workspace.collaborate" })}
                  </option>
                  <option value="critique">
                    {intl.formatMessage({ id: "chat.workspace.critique" })}
                  </option>
                </select>
                {efforts.length > 0 ? (
                  <select
                    aria-label={intl.formatMessage({ id: "chat.workspace.effort" })}
                    value={resolveEffort(agent.effort, efforts)}
                    onChange={(event) => {
                      const next = agents.map((item) =>
                        item.id === agent.id ? { ...item, effort: event.target.value } : item,
                      );
                      setAgents(next);
                      persist({ agents: next });
                    }}
                    className="h-7 rounded-lg border border-border bg-background px-2 text-ui-caption"
                  >
                    {efforts.map((effort) => (
                      <option key={effort} value={effort}>
                        {effort}
                      </option>
                    ))}
                  </select>
                ) : null}
                <Button
                  type="button"
                  variant="ghost"
                  className="h-7 px-2 text-ui-caption"
                  disabled={agents.length <= 1 || running}
                  onClick={() => {
                    const next = agents.filter((item) => item.id !== agent.id);
                    setAgents(next);
                    persist({ agents: next });
                  }}
                >
                  {intl.formatMessage({ id: "chat.workspace.remove" })}
                </Button>
              </div>
              {outputs[agent.id] ? (
                <WorkspaceMarkdown text={outputs[agent.id] ?? ""} streaming={running} />
              ) : null}
            </div>
          );
        })}
        <div className="rounded-xl border border-border bg-surface p-2">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-ui-caption">{intl.formatMessage({ id: "chat.workspace.judge" })}</span>
            <select
              value={judgeModelKey}
              onChange={(event) => {
                const modelKey = event.target.value;
                const effort = defaultEffort(
                  choices.find((choice) => choice.key === modelKey)?.efforts ?? [],
                );
                setJudgeModelKey(modelKey);
                setJudgeEffort(effort);
                persist({ judgeModelKey: modelKey, judgeEffort: effort });
              }}
              className="h-7 max-w-full flex-1 rounded-lg border border-border bg-background px-2 text-ui-caption"
            >
              {choices.map((choice) => (
                <option key={choice.key} value={choice.key}>
                  {choice.label}
                </option>
              ))}
            </select>
            {(choiceByKey(judgeModelKey)?.efforts.length ?? 0) > 0 ? (
              <select
                aria-label={intl.formatMessage({ id: "chat.workspace.effort" })}
                value={resolveEffort(judgeEffort, choiceByKey(judgeModelKey)?.efforts ?? [])}
                onChange={(event) => {
                  setJudgeEffort(event.target.value);
                  persist({ judgeEffort: event.target.value });
                }}
                className="h-7 rounded-lg border border-border bg-background px-2 text-ui-caption"
              >
                {choiceByKey(judgeModelKey)?.efforts.map((effort) => (
                  <option key={effort} value={effort}>
                    {effort}
                  </option>
                ))}
              </select>
            ) : null}
          </div>
          {outputs.judge ? <WorkspaceMarkdown text={outputs.judge} streaming={running} /> : null}
        </div>
      </div>
      <label className="mt-2 flex items-center gap-2 text-ui-caption">
        <input
          type="checkbox"
          checked={whiteboardOn}
          onChange={(event) => {
            setWhiteboardOn(event.target.checked);
            persist({ whiteboardOn: event.target.checked });
          }}
        />
        {intl.formatMessage({ id: "chat.workspace.whiteboard" })}
      </label>
      {whiteboardOn ? (
        <textarea
          value={whiteboard}
          onChange={(event) => {
            setWhiteboard(event.target.value);
            persist({ whiteboard: event.target.value });
          }}
          placeholder={intl.formatMessage({ id: "chat.workspace.whiteboardHint" })}
          className="mt-2 min-h-16 w-full rounded-lg border border-border bg-background p-2 text-ui-base"
        />
      ) : null}
      {liveBoard ? (
        <div className="mt-2 rounded-lg border border-border bg-background p-2">
          <WorkspaceMarkdown text={liveBoard} streaming={running} />
        </div>
      ) : null}
      <textarea
        value={task}
        placeholder={intl.formatMessage({ id: "chat.workspace.task" })}
        onChange={(event) => setTask(event.target.value)}
        onPaste={(event) => {
          const files = [...event.clipboardData.files];
          if (files.length === 0) return;
          event.preventDefault();
          void addFiles(files);
        }}
        onDragOver={(event) => event.preventDefault()}
        onDrop={(event) => {
          event.preventDefault();
          void addFiles([...event.dataTransfer.files]);
        }}
        className="mt-2 min-h-16 w-full rounded-lg border border-border bg-background p-2 text-ui-base"
      />
      <p className="mt-1 text-ui-caption text-muted-foreground">
        {intl.formatMessage({ id: "chat.workspace.drop" })}
      </p>
      {images.length > 0 ? (
        <div className="mt-2 flex flex-wrap gap-2">
          {images.map((image) => (
            <div
              key={image.id}
              className="relative size-12 overflow-hidden rounded-lg border border-border"
            >
              <img src={image.url} alt={image.name} className="size-full object-cover" />
              <button
                type="button"
                aria-label={intl.formatMessage({ id: "chat.attachments.remove" })}
                className="absolute top-0.5 right-0.5 z-10 grid size-3.5 place-items-center rounded-full bg-primary text-[10px] leading-none text-primary-foreground"
                onClick={() => setImages((current) => current.filter((item) => item.id !== image.id))}
              >
                ×
              </button>
            </div>
          ))}
        </div>
      ) : null}
      {error ? <p className="mt-2 text-ui-caption text-warning">{error}</p> : null}
      <div className="mt-2 flex gap-2">
        <Button
          type="button"
          className={cn("h-8 px-3 text-ui-caption")}
          disabled={running || !apiKey || !task.trim() || choices.length === 0}
          onClick={() => void run()}
        >
          {intl.formatMessage({ id: "chat.workspace.run" })}
        </Button>
        <Button
          type="button"
          variant="ghost"
          className="h-8 px-3 text-ui-caption"
          disabled={!running}
          onClick={() => abortRef.current?.abort()}
        >
          {intl.formatMessage({ id: "chat.workspace.cancel" })}
        </Button>
        <Button
          type="button"
          variant="ghost"
          className="h-8 px-3 text-ui-caption"
          disabled={
            running ||
            (searchLog.length === 0 &&
              !outputs.judge?.trim() &&
              agents.every((agent) => !outputs[agent.id]?.trim()))
          }
          onClick={() => {
            const markdown = discussionMarkdown({
              task,
              searchLog,
              sections: [
                ...agents.map((agent) => ({
                  title: `${agent.name} · ${choiceByKey(agent.modelKey)?.label ?? agent.modelKey}`,
                  body: outputs[agent.id] ?? "",
                })),
                {
                  title: intl.formatMessage({ id: "chat.workspace.judge" }),
                  body: outputs.judge ?? "",
                },
              ],
            });
            const bytes = new TextEncoder().encode(markdown);
            const data = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
            void (async () => {
              if (!platform.saveFile) {
                setError(intl.formatMessage({ id: "chat.workspace.exportFailed" }));
                return;
              }
              const result = await platform.saveFile({
                data,
                suggestedName: "workspace-discussion.md",
              });
              if (result.canceled) return;
              if (!result.success) {
                setError(intl.formatMessage({ id: "chat.workspace.exportFailed" }));
              }
            })();
          }}
        >
          {intl.formatMessage({ id: "chat.workspace.export" })}
        </Button>
      </div>
    </section>
  );
}
