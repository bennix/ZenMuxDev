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
- All download links resolve to the exact assets in the published `v3.14.35` release; the page reports the Apple notarization status only for the DMG.
- Feature statements match the shipped README and current runtime behavior.

# Landing page positioning and proof points

## Product rules

- Lead with the shipped differentiators: paired WeChat control of the same desktop task and a separately configurable model dispatcher. Do not imply automatic multi-agent task fan-out.
- Present recent product capabilities across releases 3.14.26–3.14.35. Clearly separate user-facing capabilities from current packaging and maintenance notes.
- Keep the current 22-second code-built product introduction and existing real workflow demos. Do not label the introduction as a live recording or imply it demonstrates native Computer Use or model dispatch.
- State that Intel Mac has no installer; current macOS download is Apple Silicon only. Do not link unavailable builds.
- Route product source, release, and feedback links to the `bennix/ZCode` repository. Explain ZenMuxDev as the Landing Page repository only where relevant.
- Comparison content describes workflows, not unsupported claims against named competitors. Include limitations and keep cross-provider cache reuse and token savings unpromised.
- Explain ZenCode's product contribution over upstream ZCode: ZenMux model access, model dispatch and shared context, paired WeChat control, creative workspace, and optional native Computer Use.
- Chinese and English copy must remain complete, including metadata, accessible labels, comparison and release cards.

## Acceptance

- Hero title names WeChat task continuity and model dispatch directly.
- Recent capability timeline highlights shipped functions and accurately labels the dated 3.14.35 refresh.
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

## 2026-10-23 same-version release synchronization

- Keep the bilingual page, existing screenshots, opt-in videos, download-card hierarchy, and referral disclosure. This change updates copy, not page interactions or layout ownership.
- All seven installer links remain exact v3.14.35 asset URLs; GitHub Release owns the binaries. Show the 2026-10-23 refresh date and explain that existing 3.14.35 users must download and reinstall to receive the refresh.
- Describe recoverable tool-output compression without a fixed token/billing reduction claim; clean prompt copying; Windows/Linux observe-before-action validation; per-model video duration and English-first media prompts.
- State that the refreshed video catalog contains 20 models verified in this subscription test, with account entitlement and upstream availability still applying. Do not promise every subscription or all parameter combinations.
- Billing copy must cover subscription and pay-as-you-go keys, preserving the referral disclosure.
- Acceptance: Chinese and English release/feature/FAQ copy updates completely; refresh/reinstall note persists after locale switching and reload; all seven installer URLs remain correct; desktop and 390px phone layouts have no horizontal overflow. No screenshots or video files are regenerated.

Validation: Node 24 browser checks passed at 1280px and 390px in both languages, including locale persistence, seven exact installer links and the release heading below the sticky header. Lint passed with 75 existing warnings and no errors; architecture check passed with zero violations. Full application typecheck did not pass in this standalone page checkout: workspace package resolution errors include missing `@zcode/shared` / `@zcode/services`. This is not reported as a successful application typecheck.

## Download note spacing regression

- The static page owns download layout; locale switching only changes text.
- Keep the platform availability note at least 12 CSS pixels below the download grid at 390px, 1280px, and 1920px in both languages. Preserve the refresh note spacing above the cards.
- Browser acceptance measures the grid bottom and trailing note top after each viewport/locale update; neither text nor card borders may overlap.

Validation: The new spacing assertion reproduced the overlap before the CSS fix and passed afterward for both languages at all three widths. Architecture passed with zero violations; lint passed with 75 existing warnings and zero errors. Full application typecheck still fails on missing workspace modules and consequent errors in this standalone checkout.

## Hero independence statement

- Add the user's exact Chinese theme sentence directly beneath the hero title, before the existing capability introduction. Render as an emphasized editorial statement using the page's existing typography and brass accent.
- Static page and existing locale dictionary own the copy; use `hero.statement` through the existing locale update path, with a complete English translation. No runtime or download behavior changes.
- Acceptance: Chinese text matches the supplied sentence; English expresses the same motivation and model/workflow independence; switching languages and reloading preserves the statement. Both locales remain visible without horizontal overflow at 390px, 1280px, and 1920px.

## Flagship shared foundation positioning

- Introduce “几个旗舰产品，共用一个 ZenMux 底座。” after the independence statement in the hero, with a concise bilingual explanation of ZenMux routing, local credential management and multi-agent workflows as the shared direction.
- Keep this scoped to several flagship products, not all products or identical capabilities in every product. The current page documents ZenCode only; do not invent other product names, links or cross-product credential synchronization.
- Static HTML and existing locale dictionaries own this content; no new state or interaction. Preserve current hero capabilities, actions and download links.
- Acceptance: shared-foundation heading and copy appear in Chinese and English through existing locale switching, remain before the capability introduction, and fit 390px/1280px/1920px without overflow.
