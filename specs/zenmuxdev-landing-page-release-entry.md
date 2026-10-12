# ZenCode Landing Page version, downloads, and language switch

## Product rules

- The page describes the currently published ZenCode release and links only to assets in `bennix/ZCode`.
- Download cards cover macOS Apple Silicon, Windows x64/ARM64, and Linux x64/ARM64 DEB/RPM packages.
- Feature copy reflects shipped behavior: the model dispatcher chooses execution models, shared conversation history supports model switches, multi-file plans require user selection, and WeChat reuses the paired desktop Host. Do not promise automatic task fan-out, cross-provider cache reuse, or a fixed token reduction.
- Every page section, accessible label, metadata title/description, and download label has Simplified Chinese and English copy.

## State owner and interface

- `index.html` owns the static page content and language-switch logic.
- The page's `localStorage` key `zencode-landing-locale` owns the visitor's language preference. First visit follows the browser language when it is English; otherwise it defaults to Simplified Chinese.
- The language button updates translated text, document language, title, description, image alternatives, and persists the choice. No server state or build-time localization is introduced.

```text
language button → page locale state → translated DOM + html[lang] + metadata → localStorage
```

## Acceptance

- A first visit in Chinese or English receives the corresponding complete page.
- The language button switches every visible section and can switch back; reloading preserves the chosen language.
- Mobile layout keeps the language button reachable when the navigation links collapse.
- All download links resolve to the exact assets in the published `v3.14.32` release; the page reports the Apple notarization status only for the DMG.
- Feature statements match the shipped README and current runtime behavior.

# Landing page positioning and proof points

## Product rules

- Lead with the shipped differentiators: paired WeChat control of the same desktop task and a separately configurable model dispatcher. Do not imply automatic multi-agent task fan-out.
- Present recent product capabilities across releases 3.14.26–3.14.32. Clearly separate user-facing capabilities from 3.14.32 packaging and marketplace maintenance notes.
- Use the existing 43-second promotional video as a visual proof point for creation and editable slide export. Do not label it as a live UI recording or imply it demonstrates WeChat or native Computer Use.
- State that Intel Mac has no installer; current macOS download is Apple Silicon only. Do not link unavailable builds.
- Route product source, release, and feedback links to the `bennix/ZCode` repository. Explain ZenMuxDev as the Landing Page repository only where relevant.
- Comparison content describes workflows, not unsupported claims against named competitors. Include limitations and keep cross-provider cache reuse and token savings unpromised.
- Explain ZenCode's product contribution over upstream ZCode: ZenMux model access, model dispatch and shared context, paired WeChat control, creative workspace, and optional native Computer Use.
- Chinese and English copy must remain complete, including metadata, accessible labels, comparison and release cards.

## Acceptance

- Hero title names WeChat task continuity and model dispatch directly.
- Recent capability timeline highlights shipped functions and accurately labels the 3.14.32 maintenance release.
- Promotional video appears in a labeled demo section with its actual scope disclosed; no fabricated GIF or screenshots are used.
- Source/release/feedback URLs consistently point to `bennix/ZCode`; Landing Page source may be labeled separately as ZenMuxDev.
- Comparison table uses cautious, factual workflow language and does not name or misrepresent specific competitors.
- macOS Apple Silicon availability and Intel Mac unavailability are both visible in Chinese and English.
- Differentiating ZenCode additions are distinct from the upstream ZCode attribution.
- Locale switching updates every new visible string and metadata; mobile layout remains usable.

## User-provided product screenshots

- Add the three supplied screenshots as a visual feature gallery: automation workflows, command search/palette, and IDE with the AI composer.
- Preserve the screenshots as supplied; use descriptive Chinese/English captions and alt text. Keep image proportions responsive and avoid cropping important UI.
- Place the gallery alongside the existing product demo so screenshots substantiate relevant shipped capabilities without claiming that the promotional video demonstrates them.
