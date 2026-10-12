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
