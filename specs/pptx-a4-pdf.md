# All-slide A4 PDF export

Both PPTX preview and generated Studio decks export every slide, in source order, one slide per
A4 page. Landscape slides use A4 landscape; portrait slides use portrait. Preserve intrinsic
slide geometry with uniform scaling and centered white padding; never reflow or crop to fill.
Studio exports the same prepared HTML, showSlide and presentSlide pipeline as its preview,
not editable PPTX conversion. Each source document remains in its own sandboxed iframe to
isolate CSS. No scripts run. Fonts and images finish loading before printing.

Owner: existing viewer / Studio export action owns busy state. Existing presentation print host
owns page layout and cleanup. IPlatformService owns PDF printing and save dialog. No IPC change.

snapshot of all pages → render all → await fonts/images → print A4 → dispose → save
Failure or cancelled save clears busy state and removes temporary frames/styles. Unsupported
platforms do not show the export action. UI labels explicitly say all pages and A4.

Verify multipage PDF page count and A4 dimensions, source order, identical aspect ratio,
background colors, Chinese text, hidden slides, and print-host cleanup using browser rendering.
