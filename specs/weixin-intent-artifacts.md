# Weixin intent and artifact delivery
Use the existing selected main model through Host generateWorkspaceText to classify
natural language into chat, photo, pdf or chart. No additional settings owner:
the Weixin session model selection (or draft/preferred selection) is authoritative.
Explicit /image remains available. Classification returns strict JSON and does not
execute tools; malformed output fails visibly rather than silently initiating work.
Photo requests use the system image model. Only explicit reference intent or attached
photos uses recent photos; a new photo request does not silently reuse old images.
PDF and chart requests go through the normal Agent runtime/permissions/tools; charts
must be rendered as PNG with accurate data, PDFs as actual PDF files. The user input
and attachments remain in the task. Agent must not claim file completion without writing.
A unique output path under workspace/.zencode/weixin-output is allocated and persisted
in BotState. Existing Bot owner serializes admissions and terminal processing.

input → main-model classification → photo API OR existing Agent task
Agent completion → validate expected file/type/size/path → persist sending
→ upload and send → persist sent (failure becomes failed; no ambiguous auto resend)

Only the expected local regular file under the output directory can be delivered;
reject symlinks escaping the directory, wrong signatures and files over 20 MiB.
Remote workspace artifact export is explicitly unavailable until a remote file port
exists. No new runtime or mobile task. Preserve context_token and unique client_id.
Reuse AES/CDN transport: file media_type=3, item type=4, file_name and decimal len.
Typing spans generation and delivery. Failures are reported; no fake success.
Acceptance: strict intent fixtures, explicit commands, PNG/PDF validation, traversal
rejection, encrypted file upload/decryption and send envelope, image regression.

