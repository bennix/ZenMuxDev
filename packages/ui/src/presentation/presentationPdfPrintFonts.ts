type PrintableFontScript = "latin" | "cjk" | "symbol";
type PrintableFontAvailability = (family: string, script: PrintableFontScript) => boolean;

const GENERIC_FONT_FAMILIES = new Set([
  "serif",
  "sans-serif",
  "monospace",
  "cursive",
  "fantasy",
  "system-ui",
  "ui-serif",
  "ui-sans-serif",
  "ui-monospace",
  "emoji",
  "math",
  "fangsong",
]);

const FONT_DETECTION_SAMPLES: Record<PrintableFontScript, string> = {
  latin: "mmmmmmmmmwwwwwwwiiiiiiiii 0123456789 ABCDEFG",
  cjk: "汉字排版测试かなカナ한글漢字",
  symbol: "◆▶▥✦★☻♪—“”",
};

// Skia/PDF m146 在 macOS 上可用 PingFang 做屏幕绘制，但不会把对应 glyph run 写入 PDF。
const PRINT_UNSAFE_FONT_FAMILIES = new Set(["pingfang sc"]);

const CJK_SANS_FALLBACKS = [
  "Hiragino Sans GB",
  "Microsoft YaHei",
  "Noto Sans CJK SC",
  "Source Han Sans SC",
  "Arial Unicode MS",
  "sans-serif",
];
const CJK_SERIF_FALLBACKS = [
  "Songti SC",
  "STSong",
  "SimSun",
  "Noto Serif CJK SC",
  "Source Han Serif SC",
  "serif",
];
const LATIN_SANS_FALLBACKS = ["Arial", "Helvetica", "system-ui", "sans-serif"];
const LATIN_NARROW_FALLBACKS = ["Arial Narrow", "Arial", "Helvetica", "sans-serif"];
const LATIN_SERIF_FALLBACKS = ["Times New Roman", "Times", "Georgia", "serif"];
const MONOSPACE_FALLBACKS = ["Courier New", "Menlo", "Consolas", "monospace"];
const SYMBOL_FALLBACKS = [
  "Apple Symbols",
  "Segoe UI Symbol",
  "Noto Sans Symbols 2",
  "Arial Unicode MS",
  "sans-serif",
];

function normalizeFontFamily(family: string): string {
  return family
    .trim()
    .replace(/^(?:"([\s\S]*)"|'([\s\S]*)')$/, "$1$2")
    .trim();
}

function parseFontFamilies(value: string): string[] {
  const families: string[] = [];
  let current = "";
  let quote: '"' | "'" | null = null;
  let escaped = false;
  const pushCurrent = () => {
    const family = normalizeFontFamily(current);
    if (family) {
      families.push(family);
    }
    current = "";
  };

  for (const character of value) {
    if (escaped) {
      current += character;
      escaped = false;
      continue;
    }
    if (character === "\\") {
      current += character;
      escaped = true;
      continue;
    }
    if (quote) {
      current += character;
      if (character === quote) {
        quote = null;
      }
      continue;
    }
    if (character === '"' || character === "'") {
      quote = character;
      current += character;
      continue;
    }
    if (character === ",") {
      pushCurrent();
      continue;
    }
    current += character;
  }
  pushCurrent();
  return families;
}

function formatFontFamily(family: string): string {
  const normalized = normalizeFontFamily(family);
  if (GENERIC_FONT_FAMILIES.has(normalized.toLowerCase())) {
    return normalized.toLowerCase();
  }
  return /[\s,"']/.test(normalized)
    ? `"${normalized.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`
    : normalized;
}

function detectFontScript(text: string): PrintableFontScript {
  if (/\p{Script=Han}|\p{Script=Hiragana}|\p{Script=Katakana}|\p{Script=Hangul}/u.test(text)) {
    return "cjk";
  }
  return /[\p{L}\p{N}]/u.test(text) ? "latin" : "symbol";
}

function isGenericFontFamily(family: string): boolean {
  return GENERIC_FONT_FAMILIES.has(normalizeFontFamily(family).toLowerCase());
}

function isKnownPrintUnsafeFontFamily(family: string): boolean {
  return PRINT_UNSAFE_FONT_FAMILIES.has(normalizeFontFamily(family).toLowerCase());
}

function classifyFontFamily(families: readonly string[]): "sans" | "narrow" | "serif" | "mono" {
  const joined = families.join(" ").toLowerCase();
  if (/mono|courier|consolas|menlo/.test(joined)) {
    return "mono";
  }
  if (/narrow|condensed|oswald|bebas/.test(joined)) {
    return "narrow";
  }
  if (
    !/sans/.test(joined) &&
    /serif|times|georgia|song|simsun|宋体|ming|mincho|playfair/.test(joined)
  ) {
    return "serif";
  }
  return "sans";
}

function getFallbackFamilies(
  script: PrintableFontScript,
  category: ReturnType<typeof classifyFontFamily>,
): readonly string[] {
  if (script === "symbol") {
    return SYMBOL_FALLBACKS;
  }
  if (script === "cjk") {
    return category === "serif" ? CJK_SERIF_FALLBACKS : CJK_SANS_FALLBACKS;
  }
  if (category === "mono") {
    return MONOSPACE_FALLBACKS;
  }
  if (category === "serif") {
    return LATIN_SERIF_FALLBACKS;
  }
  return category === "narrow" ? LATIN_NARROW_FALLBACKS : LATIN_SANS_FALLBACKS;
}

function appendGenericFallback(
  families: readonly string[],
  category: ReturnType<typeof classifyFontFamily>,
): string[] {
  if (families.some(isGenericFontFamily)) {
    return [...families];
  }
  return [
    ...families,
    category === "mono" ? "monospace" : category === "serif" ? "serif" : "sans-serif",
  ];
}

/**
 * 返回需要写入打印 DOM 的确定性字体栈；null 表示原首选字体已经可用，无需改动。
 */
function resolvePrintableFontFamily(
  fontFamily: string,
  text: string,
  isFontAvailable: PrintableFontAvailability,
): string | null {
  const families = parseFontFamilies(fontFamily);
  if (families.length === 0) {
    return null;
  }
  const script = detectFontScript(text);
  const category = classifyFontFamily(families);
  const isAvailable = (family: string) =>
    isGenericFontFamily(family) ||
    (!isKnownPrintUnsafeFontFamily(family) && isFontAvailable(family, script));

  if (isAvailable(families[0]!)) {
    return null;
  }
  const availableIndex = families.findIndex(isAvailable);
  if (availableIndex >= 0) {
    return appendGenericFallback(families.slice(availableIndex), category)
      .map(formatFontFamily)
      .join(", ");
  }

  const fallbacks = getFallbackFamilies(script, category);
  const fallbackIndex = fallbacks.findIndex(isAvailable);
  const selected = fallbackIndex >= 0 ? fallbacks.slice(fallbackIndex) : fallbacks.slice(-1);
  return selected.map(formatFontFamily).join(", ");
}

function createCanvasFontAvailability(hostDocument: Document): PrintableFontAvailability {
  if (typeof hostDocument.defaultView?.CanvasRenderingContext2D !== "function") {
    return () => false;
  }
  const canvas = hostDocument.createElement("canvas");
  const context = canvas.getContext("2d");
  if (!context) {
    return () => false;
  }
  const isMacOS = /Mac/i.test(hostDocument.defaultView?.navigator.platform ?? "");
  const macOSSubstitutedWindowsFonts = new Set([
    "microsoft yahei",
    "microsoft yahei ui",
    "微软雅黑",
    "dengxian",
    "等线",
    "simhei",
    "黑体",
    "heiti sc",
  ]);
  const cache = new Map<string, boolean>();
  return (family, script) => {
    // CoreText 会把未安装的 Windows CJK family 别名替换成 macOS 字体，Canvas 量宽无法区分；
    // 继续保留原 family 会让 Skia 打印再次丢字，因此 macOS 直接交给可打印 CJK fallback。
    if (isMacOS && macOSSubstitutedWindowsFonts.has(normalizeFontFamily(family).toLowerCase())) {
      return false;
    }
    // CJK 字体缺失时浏览器会继续落到另一个 CJK 系统字体；用 CJK 样本文字量宽会把这次隐式回退
    // 误判为候选字体已安装。常见 CJK 字体都包含 Latin glyph，用 Latin 样本才能识别具体 family。
    const detectionScript = script === "cjk" ? "latin" : script;
    const key = `${family}\u0000${detectionScript}`;
    const cached = cache.get(key);
    if (cached !== undefined) {
      return cached;
    }
    const sample = FONT_DETECTION_SAMPLES[detectionScript];
    const candidate = formatFontFamily(family);
    const available = ["monospace", "serif", "sans-serif"].some((baseline) => {
      context.font = `72px ${baseline}`;
      const baselineWidth = context.measureText(sample).width;
      context.font = `72px ${candidate}, ${baseline}`;
      return Math.abs(context.measureText(sample).width - baselineWidth) > 0.01;
    });
    cache.set(key, available);
    return available;
  };
}

/**
 * 屏幕预览允许未安装字体走隐式 fallback，但 Chromium/Skia 打印不会稳定保留这层回退，
 * 导致对应文字没有写入 PDF。这里只改一次性打印 DOM，把真实可用字体提升到字体栈首位。
 */
export function materializePrintableFontFamilies(
  hostDocument: Document,
  host: HTMLElement,
  isFontAvailable: PrintableFontAvailability = createCanvasFontAvailability(hostDocument),
): void {
  const showText = hostDocument.defaultView?.NodeFilter.SHOW_TEXT ?? 4;
  const walker = hostDocument.createTreeWalker(host, showText);
  const textByParent = new Map<HTMLElement, string>();
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const text = node.textContent?.trim();
    const parent = node.parentElement;
    if (!text || !parent) {
      continue;
    }
    textByParent.set(parent, `${textByParent.get(parent) ?? ""}${text}`);
  }

  const view = hostDocument.defaultView;
  for (const [element, text] of textByParent) {
    const fontFamily = view?.getComputedStyle(element).fontFamily || element.style.fontFamily;
    if (!fontFamily) {
      continue;
    }
    const printableFontFamily = resolvePrintableFontFamily(fontFamily, text, isFontAvailable);
    if (printableFontFamily) {
      element.style.fontFamily = printableFontFamily;
    }
  }
}

