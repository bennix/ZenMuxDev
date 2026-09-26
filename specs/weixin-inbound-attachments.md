# Weixin inbound attachment protocol correction (milestone D in progress)

Observed report: PDF followed by a question receives an exact echo. Current persisted
configuration has Echo false; screenshot alone cannot prove which mode handled the
old message. Separately confirmed in source: media encrypt_query_param is parsed as
an ID but never made into a download URL. Valid iLink file references without full_url
therefore cannot download. file_item.len is a decimal string but only numeric values
are accepted. voice_item.text is also missing from text parsing.

Protocol reference: Tencent/openclaw-weixin docs/protocol_zh_CN.md. Prefer full_url;
otherwise construct https://novac2c.cdn.weixin.qq.com/c2c/download using URL-encoded
encrypted_query_param. Parse plaintext length as a nonnegative safe integer. Preserve
filename, MIME type and AES metadata across polling and callback reconstruction.
Download/decrypt through the existing provider; Bot service caches bytes locally and
supplies the local path to the existing agent. Voice transcription is text; do not
also send the same transcribed voice as binary media. No native voice output.

Encrypted attachments missing AES keys must fail visibly, never fall back to treating
ciphertext as a document. Download response body shares a bounded timeout and size cap
with the existing 5 MiB bot attachment limit plus AES padding. Do not log URLs or keys.

Acceptance: protocol fixture with PDF filename, string length, nested CDN reference and
AES key; decrypt exact original PDF bytes; full URL precedence; bad/missing key rejected;
voice transcription preserved. Actual user PDF reading requires resending after the fix:
already acknowledged attachments in Echo mode cannot be recovered from screenshot.
This change does not claim outbound media support or full milestone D completion.

Live evidence 2026-09-27: the supplied 3,661,771-byte PDF and the cached Weixin file
have identical SHA-256. Existing runtime successfully rendered pages 1–20 and then
started unrelated web research in a subagent. The PDF actually has 24 pages; printed
slide footers saying 20 are not authoritative. Therefore this live case is task drift
and incomplete scope feedback, not corrupted transfer. Default attachment-only
instructions should request a concise content summary first, without unsolicited
web research or code/legal audits. The PDF Read tool must expose actual total page
count with extracted ranges so later exercise pages are not silently overlooked.

The same live session's final assistant record reports model_request_cancelled after
subagent web research. Do not infer who cancelled it. A task_complete event whose
stopReason is cancelled must send an explicit interruption notice even if earlier
progress text was sent; that text cannot stand in for a final answer. Stop typing
only after the notice has been delivered (or its send failed).
