export interface DeckTheme {
  id: string;
  paper: string;
  ink: string;
  accent: string;
  card: string;
  titleFont: string;
  bodyFont: string;
}
const THEMES: Record<string, DeckTheme> = {
  magazine: {
    id: "magazine",
    paper: "#F5F1E8",
    ink: "#25231F",
    accent: "#A34830",
    card: "#E9E2D5",
    titleFont: 'Georgia, "Noto Serif CJK SC", "Songti SC", serif',
    bodyFont: 'Arial, "Noto Sans CJK SC", "Microsoft YaHei", sans-serif',
  },
  swiss: {
    id: "swiss",
    paper: "#FFFFFF",
    ink: "#161616",
    accent: "#D62720",
    card: "#F0F0F0",
    titleFont: 'Arial, Helvetica, "Noto Sans CJK SC", sans-serif',
    bodyFont: 'Arial, Helvetica, "Noto Sans CJK SC", sans-serif',
  },
};
export function deckThemeForStyle(style: string): DeckTheme {
  return THEMES[style === "瑞士风" || style === "swiss" ? "swiss" : "magazine"]!;
}

/** 提示词不能保证主题落地；保存与预览共用这份已应用主题的 HTML。 */
export function applyDeckTheme(html: string, theme: DeckTheme): string {
  const doc = new DOMParser().parseFromString(html, "text/html");
  const set = (el: HTMLElement, name: string, value: string) =>
    el.style.setProperty(name, value, "important");
  doc.body.dataset.studioTheme = theme.id;
  for (const [name, value] of Object.entries({
    paper: theme.paper,
    ink: theme.ink,
    accent: theme.accent,
    card: theme.card,
  }))
    set(doc.documentElement, `--deck-${name}`, value);
  set(doc.body, "background", theme.paper);
  set(doc.body, "color", theme.ink);
  set(doc.body, "font-family", theme.bodyFont);
  for (const el of doc.querySelectorAll<HTMLElement>(
    '[data-pptx-kind="text"],h1,h2,h3,p,pre,code',
  )) {
    if (el.closest("svg")) continue;
    if (el.matches("pre,code") || el.closest("pre,code")) {
      set(el, "font-family", "monospace");
      set(el, "color", "#F7F4EF");
      if (el.matches("pre")) set(el, "background-color", "#202020");
      continue;
    }
    set(
      el,
      "font-family",
      el.matches('h1,h2,[data-pptx-role="title"]') ? theme.titleFont : theme.bodyFont,
    );
    if (el.matches('h1,h2,[data-pptx-role="title"]')) set(el, "color", theme.ink);
  }
  for (const el of doc.querySelectorAll<HTMLElement>(
    '[data-pptx-role="accent"],[data-pptx-role="card"]',
  )) {
    set(el, "background-color", el.dataset.pptxRole === "accent" ? theme.accent : theme.card);
  }
  return `<!doctype html>\n${doc.documentElement.outerHTML}`;
}
