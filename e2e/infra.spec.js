import { test, expect } from "@playwright/test";
import path from "node:path";

// Cross-cutting infra proofs. Each test records video + trace into e2e/artifacts.
//   AC1 — a malformed game message is rejected by the central validator.
//   AC2 — a protocolVersion mismatch surfaces the refresh prompt.
//   AC3 — a feature-flag-disabled game refuses a new room.

const API = "ws://localhost:3001";
const artifactDir = path.resolve("e2e/artifacts");

// Open a raw WS to the gateway from inside the page, run a small protocol
// exchange, and return the collected server replies. Keeps these tests
// independent of any particular game's UI state.
async function wsExchange(page, { send, collectUntil, timeoutMs = 5000 }) {
  return page.evaluate(
    ({ API, send, collectUntil, timeoutMs }) =>
      new Promise((resolve, reject) => {
        const playerId = window.crypto.randomUUID();
        const ws = new WebSocket(`${API}?playerId=${playerId}`);
        const received = [];
        const timer = setTimeout(() => {
          ws.close();
          reject(new Error(`timed out; received: ${JSON.stringify(received)}`));
        }, timeoutMs);
        let helloSeen = false;
        ws.onmessage = (e) => {
          const msg = JSON.parse(e.data);
          received.push(msg);
          if (msg.t === "ping") return; // ignore heartbeat
          if (msg.t === "hello" && !helloSeen) {
            helloSeen = true;
            for (const out of send) ws.send(JSON.stringify(out));
            return;
          }
          if (msg.t === collectUntil) {
            clearTimeout(timer);
            ws.close();
            resolve(received);
          }
        };
        ws.onerror = () => {
          clearTimeout(timer);
          reject(new Error("ws error"));
        };
      }),
    { API, send, collectUntil, timeoutMs },
  );
}

test("AC1: a malformed message is rejected by the central validator", async ({ browser }) => {
  const ctx = await browser.newContext({ recordVideo: { dir: artifactDir } });
  await ctx.tracing.start({ screenshots: true, snapshots: true, title: "INFRA-AC1" });
  const page = await ctx.newPage();
  await page.goto("http://localhost:5173/games/poker/");

  // Create a poker room over a raw socket, then send a game message whose shape
  // matches no entry in poker's validGameMessages schema.
  const replies = await wsExchange(page, {
    send: [
      { t: "lobby:create", gameId: "poker", name: "Tester" },
      { t: "game", __evil: true },
    ],
    collectUntil: "error",
  });
  const err = replies.find((m) => m.t === "error");
  expect(err).toBeTruthy();
  expect(err.message).toMatch(/invalid message/);

  await ctx.tracing.stop({ path: path.join(artifactDir, "trace-infra-ac1.zip") });
  await ctx.close();
});

test("AC2: a version mismatch surfaces a refresh prompt", async ({ browser }) => {
  const ctx = await browser.newContext({ recordVideo: { dir: artifactDir } });
  await ctx.tracing.start({ screenshots: true, snapshots: true, title: "INFRA-AC2" });
  const page = await ctx.newPage();

  // Intercept the gateway socket and rewrite the server's hello frame so the
  // client sees a protocolVersion it does not recognize.
  await page.routeWebSocket(/localhost:3001/, (ws) => {
    const server = ws.connectToServer();
    server.onMessage((message) => {
      try {
        const msg = JSON.parse(message);
        if (msg.t === "hello") {
          ws.send(JSON.stringify({ ...msg, protocolVersion: "99.99.99" }));
          return;
        }
      } catch {
        /* forward non-JSON unchanged */
      }
      ws.send(message);
    });
    ws.onMessage((message) => server.send(message));
  });

  await page.goto("http://localhost:5173/games/poker/");
  await expect(page.getByText(/Server updated — please refresh/)).toBeVisible({ timeout: 10_000 });

  await ctx.tracing.stop({ path: path.join(artifactDir, "trace-infra-ac2.zip") });
  await ctx.close();
});

test("AC3: a game disabled by its feature flag refuses a new room", async ({ browser }) => {
  const ctx = await browser.newContext({ recordVideo: { dir: artifactDir } });
  await ctx.tracing.start({ screenshots: true, snapshots: true, title: "INFRA-AC3" });
  const page = await ctx.newPage();
  await page.goto("http://localhost:5173/games/poker/");

  const replies = await wsExchange(page, {
    send: [{ t: "lobby:create", gameId: "_infra-test", name: "Tester" }],
    collectUntil: "error",
  });
  const err = replies.find((m) => m.t === "error");
  expect(err).toBeTruthy();
  expect(err.message).toMatch(/_infra-test is disabled/);

  await ctx.tracing.stop({ path: path.join(artifactDir, "trace-infra-ac3.zip") });
  await ctx.close();
});
