# Cross-platform editable PPTX text layout

## Product rules

- This specification applies only to editable PPTX export. Browser preview and other export paths keep their current rendering and behavior.
- Exported fonts are portable family names only: Chinese sans serif uses Microsoft YaHei, Chinese serif uses SimSun; Latin sans serif uses Arial, Latin serif uses Times New Roman, and monospace uses Courier New. Font availability on the build machine must not change the output.
- A block text element (`p`, `h1`–`h6`, `li`, `td`, `th`, and related semantic blocks) exports as one editable text box and wraps in PowerPoint. Mixed Chinese, Latin, and full-width punctuation stay in the same box. When scripts need different fonts, represent them as rich-text runs inside that box. Only a genuinely inline element that spans visual lines may produce more than one box.
- List items use PowerPoint bullet metadata; the exported text does not contain a manually prefixed bullet glyph.
- Convert browser line-height to a proportional `spcPct`/`lineSpacingMultiple`, never an exact point spacing.
- Text-box geometry follows the browser content rectangle, including padding and borders. Do not apply export-only slack or move neighbouring elements.

## State owner and boundaries

`packages/ui/src/v4/composer/studio/htmlToEditablePptx.ts` owns HTML-to-editable-page measurement and PPTX writing. Its measurement helpers own portable font selection, rich-text run grouping, and text-box geometry. The preview remains owned by the existing HTML renderer and is not modified. The explicitly labelled visual export uses PDFium and the existing print host.

```text
HTML slide → browser measurement → one editable block text node + font runs
           → preserve measured content geometry → PptxGenJS → editable PPTX
preview ─────────────────────────────── unchanged HTML rendering
```

## Acceptance scenarios

- The same CSS font declaration produces the prescribed portable font names regardless of installed fonts.
- A paragraph containing Chinese, English, and full-width punctuation is one editable text box with ordered rich-text runs, not multiple text boxes.
- `li` exports with a native bullet; line-height exports as a percentage multiple; wrapping remains enabled for block elements.
- The writer preserves measured coordinates and sizes without expanding decoration containers.
- For the same 20-page source deck, total text-box count falls by at least 60% compared with the prior export.
- `python3 audit_pptx.py <exported-sample.pptx>` passes without changing the script's thresholds.
- Add unit tests for portable font selection and mixed-script text remaining within one text box. Run `pnpm typecheck`, `pnpm lint`, and `pnpm architecture:check --changed`.

## Migration boundary

This changes only editable PPTX generation. Existing HTML, preview, persisted slide content, and all non-PPTX export formats remain unchanged. No Office application is required to generate the file; WPS/Office interoperability claims must be limited to checks actually run.

## 2026-09-29: preserve preview geometry

The editable writer must preserve measured geometry, without widening text, shrinking fonts, resizing decoration containers, or moving neighbours. Measurement uses the same normalized document as preview/PDF, waits for images/fonts, and applies text padding/borders to the text content rectangle. Native Office font metrics can still differ; editable export cannot promise pixel equivalence.

Add an explicitly labelled visual PPT export alongside editable PPT. It uses the same print host and platform PDF operation as the A4 PDF export, then rasterizes each PDF page at 2x slide resolution, removes only the known centered A4 letterboxing, and creates one full-slide PNG per PPT slide. It preserves all pages and their order. Its UI says slides are images and individual elements are not editable. Failure is visible, saves no partial file, and the shared export lock prevents concurrent print hosts. No user files are overwritten without the platform save operation.

```text
HTML → shared preview document → measured content geometry → editable PPT
     → existing print host → platform PDF → page PNG → visual PPT
```

Regression checks: padding and centred/flex content coordinates; no writer relocation of text or decoration geometry; identical preview/PPT measurement styles; multi-page visual PPT retains page ordering and 16:9 geometry. Inspect supplied 10-page PDF against visual PPT rendered by LibreOffice. Do not claim PowerPoint/WPS testing unless actually performed.

Visual export bundles PDFium WASM locally (MIT/Apache-2.0), loaded only on export. PDF.js was rejected because Chromium Type 1 shading becomes a magenta placeholder; a generated conic-gradient fixture covers this case. No document content is sent to a remote rendering service. Each bitmap/page/document/allocation is released in finally blocks.
