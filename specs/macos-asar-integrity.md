# macOS packaged ASAR integrity

The packaging hook owns the final archive metadata. Runtime dependency injection and
source-map cleanup rewrite app.asar after electron-builder computes its original
header hash. Observed output has different stored and actual SHA-256 values.

After all archive rewrites, before signing, the afterPack hook must recompute SHA-256
of the final ASAR header and update only ElectronAsarIntegrity.Resources/app.asar in
Info.plist. Preserve other plist fields and archive entries. Non-macOS packages skip
this macOS metadata step. Missing/corrupt archives or plist fail packaging visibly.
Use asynchronous file IO; no post-install or manual metadata repair is required.

Order: builder archive → dependency injection → source-map cleanup → integrity
metadata update → signing → verification. No application/session state is involved.

Acceptance: a real small ASAR rewritten after initial metadata gets its new hash;
unrelated plist fields remain intact, repeated calls are idempotent, and non-macOS
contexts perform no filesystem writes. Verify the final signed package hash matches.
