# Weixin iLink settings pairing and text echo (milestone B)

## Scope

Current user direction: pairing belongs in Settings; first verify `ping` → `pong`
without invoking an LLM. Reuse the existing TypeScript Bot service. No Hermes,
OpenClaw Gateway, web-WeChat, group support or native voice output is introduced.
This is one reviewable milestone; model replies and media expansion remain C/D.

## Evidence and defects

Existing registration uses GET instead of the current POST QR API, drops login
`baseurl` and `ilink_user_id`, and treats verification/redirect as ordinary waiting.
Authenticated requests omit application headers and send an obsolete channel version.
Replies set `from_user_id` to the bot ID instead of the required empty string.
Token expiry is flattened into a generic error and retried forever.

## Ownership and event order

```text
Settings pairing → IBotsService registration → temporary QR state
confirmed → existing credential service(token) + BotConfig(base URL, bot/user IDs)
          → existing single-owner polling lock → getupdates
          → save opaque cursor → diagnostic echo sendmessage(context_token)
-14       → stop poller + visible Settings error → explicit new pairing
```

The cursor lives in existing bot state. Echo mode is a persisted BotConfig option;
new pairings start in echo mode, existing configurations keep their existing mode.
The existing production callback path retains its durable-admission-before-cursor
ordering. Echo intentionally acknowledges the cursor before sending; a crash can lose
an echo, and uncertain sends are not replayed automatically. No promise of exactly-once
Weixin delivery is made. Multiple ZenCode windows share the existing polling lock;
external Hermes/OpenClaw processes cannot be locked by ZenCode and must be stopped.

## Protocol

- QR POST body `{local_token_list: []}`; show `qrcode_img_content`, poll using `qrcode`.
- Handle wait, scaned, need_verifycode, scaned_but_redirect, expired and confirmed.
  Never convert a QR polling key into a QR image when image content is absent.
- Confirmed pairing stores token through CredentialService and baseurl/user/bot IDs
  through the existing bot config service. Subsequent requests use returned baseurl.
- App ID `bot`, client version `132102`, fresh Base64(decimal random uint32) UIN.
- Authenticated POST bodies carry channel version `2.4.8` and bot agent `ZenCode`.
- getupdates deadline 40 seconds; empty batches are normal. -14 is a typed session
  expiration and stops polling until the user pairs again.
- Echo only private inbound messages, with empty from_user_id, unique client_id,
  message_type=2, message_state=2 and the exact inbound context_token.
- Split text at 4000 Unicode code points; each part has its own client ID.

## Acceptance

- Mock transport tests inspect login method, body, headers, redirect/verification,
  persistence fields, reply envelope and token expiration.
- Browser test: Settings pairing entrance opens Weixin configuration; echo control
  reflects and updates persisted configuration rather than keeping a separate mode.
- Live gate: user scans in Settings, sends ping, receives pong. Do not claim this gate
  passed without the real Weixin event and response. No C/D rollout before this gate.

Cursor correction: transport progress must not depend on a selected workspace. Store
new cursors in the same Bot repository's optional `weixinCursors[botId]` map; read the
legacy `bots[botId].weixinGetUpdatesBuf` only for migration, remove it on the next
write. Stop the old poller before saving replacement credentials and clear its cursor.

## Live acceptance record

2026-09-27: the user confirmed receiving `pong` after pairing in ZenCode Settings
and sending `ping` from Weixin. This is user-reported live acceptance, not an
independently captured transport trace. Milestone B passes its live gate.
Milestones C (allowlist, typing and model text replies) and D (media) remain
separate changes; this acceptance does not verify those capabilities.
