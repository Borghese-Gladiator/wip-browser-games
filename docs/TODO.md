# TODO — Known remaining work

Captured after fixing the multiplayer "not in a room" seating bug
(commit `318a3ca`). Each item below was observed during that session, not
speculative.

## 1. infra.spec AC2 — version-mismatch refresh banner (pre-existing failure)

- **Status:** Fails on baseline *and* with the seating fix. Not a product bug.
- **Detail:** The product path is correct — the gateway sends a `hello` frame
  with `protocolVersion`; the client sets `needsRefresh` when it differs from
  `PROTOCOL_VERSION`, and `RefreshBanner` renders "Server updated — please
  refresh to continue." The test (`e2e/infra.spec.js:74`) tries to force a
  mismatch by intercepting the socket with `page.routeWebSocket(...)` and
  `ws.connectToServer()` to rewrite the `hello` frame to `99.99.99`, but the
  rewritten frame never reaches the client, so the banner never appears.
- **Fix options:** Repair the Playwright WS-routing interception, or inject a
  version mismatch a different way (e.g. a server-side test hook / env override
  for the advertised `protocolVersion`).

## 2. Actions dropped during the reconnect window (latent client gap)

- **Status:** Latent robustness issue; not currently failing a kept test.
- **Detail:** The fix re-joins the room on socket `open`, but a `game` message
  fired *during* the brief reconnect/StrictMode socket churn is sent on a
  transient socket and silently lost (`rawSend` = `ws.current?.send(...)`).
  The 4-player e2e specs survive because they retry actions in a loop; the
  single-shot observability action exposed the loss until the room-code parsing
  bug (item below) was also fixed. A real user clicking once during a network
  blip could still lose that action.
- **Fix:** Small outbound message queue in `useGameSocket` that buffers sends
  while the socket isn't OPEN and flushes on `open` (after the rejoin replay).

## 3. E2E suite is not hermetic — cross-spec gateway-state contention

- **Status:** Each spec passes in clean isolation; the full suite (parallel or
  serial) fails on later specs.
- **Detail:** All specs run against one long-lived gateway (`playwright.config.js`
  starts it once). Rooms, held seats, the shared per-IP rate-limit bucket, and
  the outcome store accumulate across specs, causing seating/lobby contention
  and stale leaderboard reads by the time later specs run.
- **Fix:** Make the suite hermetic — fresh gateway per spec file, or a reset
  endpoint/teardown the gateway exposes for tests.

## 4. Runtime-cruft hygiene during tests

- **Status:** Test-environment papercut that silently skewed results.
- **Detail:** `outcomes.json` / `achievements.json` (gitignored) and the
  `snapshots/` dir accumulate across runs. Stale `outcomes.json` made the
  leaderboard spec fail ("winner missing from all-time board"); restored
  `snapshots/` rooms inflate `/stats`. Both are regenerated at runtime.
- **Fix:** Clear these in a test setup/teardown hook so runs start from a clean
  store. (The gateway already restores `snapshots/` on boot by design — tests
  just need an empty starting state.)

---

## Done this session (for reference)

- **Client rejoin on reconnect** (`packages/game-client/src/useGameSocket.js`):
  record a join intent, replay it on socket `open`, and ignore closes from a
  superseded socket so the StrictMode mount/cleanup/mount cycle doesn't spawn an
  orphan connection. Fixes the repeated "not in a room" rejection.
- **Idempotent auto-start** (`packages/game-core/src/rooms.js`): `_maybeAutoStart`
  no longer re-runs once the game has started, so `startEarly` ("Start with
  bots") can't throw "hand in progress" and abort the `host:start` broadcast.
- **E2E room-code parsing**: strip the `RoomCode` "Copy" button text in poker,
  sheng-ji, leaderboard, and observability specs (observability used the raw
  code in a `/stats` lookup that silently missed).
- **chrome.spec reconnect assertion**: close the live socket directly instead of
  relying on `context.setOffline`, which does not sever an already-open loopback
  WebSocket.

Verified: 224 unit tests pass; poker, sheng-ji, chrome, identity, leaderboard,
and observability each pass in clean isolation.
