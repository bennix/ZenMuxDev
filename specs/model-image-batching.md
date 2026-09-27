# Ten-image batches
When an Agent model request contains more than ten visible image blocks, analyze all
images sequentially in batches of at most ten using the selected model. Preserve
image order and labels (message/block index). Each batch receives nearby text and
the current task text, has no tools, and produces factual observations with uncertainty.
Replace image blocks only in the outgoing projection with labeled batch summaries.
Keep original persisted messages and files unchanged. Final synthesis sees summaries,
not a repeated full image collection. At ten or fewer images leave the request intact.
Core runtime owns this projection before the existing aggregate byte-budget pass.
No new session state. Cancel/failure stops subsequent batches and final synthesis;
do not silently skip images or automatically switch models. Progress is emitted through
existing model-stream events. CUA image reference credentials must be invalidated with
their summarized raster, so the model cannot click using a raster it no longer sees.
Record batch model usage separately. Native PDF page counts are outside this image-block
policy; explicit rendered PDF images are included.
Acceptance: 51 images => 10/10/10/10/10/1; source remains unchanged; text/tool metadata
preserved; cancellation and batch failure stop dispatch; <=10 fast path.
