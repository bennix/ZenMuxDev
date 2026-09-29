# UI file size maintenance

Split two files exceeding the existing 400-line lint limit without changing runtime behavior or disabling rules.

- Extract print font detection/fallback into `presentationPdfPrintFonts.ts`, exporting only `materializePrintableFontFamilies`. The print host retains ownership of DOM lifetime, readiness and disposal; font policy and its per-call cache remain unchanged.
- Extract `ContextWindowTierPicker` and its fixed tiers into a sibling component. Dialog retains draft/validation/IME state and passes the same selected value and callback. Markup and event order are unchanged.
- All files remain in the UI module; no new cross-module dependency or persistence.

Acceptance: root lint has no errors; root typecheck and architecture check pass; existing A4 PDF and export fidelity browser tests pass. Verify extraction is text-preserving apart from imports and the exported function declarations.
