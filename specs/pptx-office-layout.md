# Cross-platform editable PPTX text layout

## Product rules

- This specification applies only to editable PPTX export. Browser preview and other export paths keep their current rendering and behavior.
- Exported fonts are portable family names only: Chinese sans serif uses Microsoft YaHei, Chinese serif uses SimSun; Latin sans serif uses Arial, Latin serif uses Times New Roman, and monospace uses Courier New. Font availability on the build machine must not change the output.
- A block text element (`p`, `h1`–`h6`, `li`, `td`, `th`, and related semantic blocks) exports as one editable text box and wraps in PowerPoint. Mixed Chinese, Latin, and full-width punctuation stay in the same box. When scripts need different fonts, represent them as rich-text runs inside that box. Only a genuinely inline element that spans visual lines may produce more than one box.
- List items use PowerPoint bullet metadata; the exported text does not contain a manually prefixed bullet glyph.
- Convert browser line-height to a proportional `spcPct`/`lineSpacingMultiple`, never an exact point spacing.
- Text-box width is based on browser measurement with 3%–5% export slack. Keep existing width recovery and decoration-container fitting; do not increase font size or shrink below the existing `BODY_FLOOR`.

## State owner and boundaries

`packages/ui/src/v4/composer/studio/htmlToEditablePptx.ts` owns HTML-to-editable-page measurement and PPTX writing. Its measurement helpers own portable font selection, rich-text run grouping, and text-box geometry. The preview remains owned by the existing HTML renderer and is not modified. No new dependency or alternate export path is introduced.

```text
HTML slide → browser measurement → one editable block text node + font runs
           → export-only fit/slack → PptxGenJS → editable PPTX
preview ─────────────────────────────── unchanged HTML rendering
```

## Acceptance scenarios

- The same CSS font declaration produces the prescribed portable font names regardless of installed fonts.
- A paragraph containing Chinese, English, and full-width punctuation is one editable text box with ordered rich-text runs, not multiple text boxes.
- `li` exports with a native bullet; line-height exports as a percentage multiple; wrapping remains enabled for block elements.
- Export-only width slack preserves the existing text-fit behavior, never scales text up, and never shrinks body text below `BODY_FLOOR`.
- For the same 20-page source deck, total text-box count falls by at least 60% compared with the prior export.
- `python3 audit_pptx.py <exported-sample.pptx>` passes without changing the script's thresholds.
- Add unit tests for portable font selection and mixed-script text remaining within one text box. Run `pnpm typecheck`, `pnpm lint`, and `pnpm architecture:check --changed`.

## Migration boundary

This changes only editable PPTX generation. Existing HTML, preview, persisted slide content, and all non-PPTX export formats remain unchanged. No Office application is required to generate the file; WPS/Office interoperability claims must be limited to checks actually run.
