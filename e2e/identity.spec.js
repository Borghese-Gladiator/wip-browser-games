import { test, expect } from '@playwright/test';
import path from 'node:path';

test('identity persists across reload and reconnect reclaims seat', async ({ browser }) => {
  const artifactDir = path.resolve('e2e/artifacts');
  const [ctx1, ctx2] = await Promise.all([
    browser.newContext({ recordVideo: { dir: artifactDir } }),
    browser.newContext({ recordVideo: { dir: artifactDir } }),
  ]);
  await Promise.all([
    ctx1.tracing.start({ screenshots: true, snapshots: true, title: 'Identity-P1' }),
    ctx2.tracing.start({ screenshots: true, snapshots: true, title: 'Identity-P2' }),
  ]);
  const [page1, page2] = await Promise.all([ctx1.newPage(), ctx2.newPage()]);

  // AC1: stable playerId across reload
  await page1.goto('http://localhost:5173/games/poker/');
  const id1 = await page1.evaluate(() => localStorage.getItem('browser-games:playerId'));
  expect(id1).toMatch(/^[0-9a-f-]{36}$/);
  await page1.reload();
  const id1After = await page1.evaluate(() => localStorage.getItem('browser-games:playerId'));
  expect(id1After).toBe(id1);

  // AC2: reconnect reclaims seat. Capture 'joined' seats via WS frame interception.
  let seatBefore = -1;
  let seatAfter = -1;
  page1.on('websocket', (ws) => {
    ws.on('framereceived', ({ payload }) => {
      try {
        const msg = JSON.parse(payload);
        if (msg.t === 'joined') seatBefore = msg.seat;
      } catch {}
    });
  });

  await page1.goto('http://localhost:5173/games/poker/'); // re-navigate after reload
  await page2.goto('http://localhost:5173/games/poker/');

  await page1.getByLabel('Your name').fill('Alice');
  await page1.getByRole('button', { name: 'Create room' }).click();
  const roomText = await page1.getByText(/^Room: /).textContent({ timeout: 5000 });
  const code = roomText.replace('Room:', '').trim();
  expect(seatBefore).toBe(0); // seat was assigned

  // Page2 joins so the room survives page1's disconnect.
  await page2.getByLabel('Your name').fill('Bob');
  await page2.getByLabel('Room code').fill(code);
  await page2.getByRole('button', { name: 'Join by code' }).click();

  // page1 "disconnects" by reloading (drops the socket), then rejoins the room.
  page1.on('websocket', (ws) => {
    ws.on('framereceived', ({ payload }) => {
      try {
        const msg = JSON.parse(payload);
        if (msg.t === 'joined') seatAfter = msg.seat;
      } catch {}
    });
  });
  await page1.reload();
  await page1.getByLabel('Your name').fill('Alice');
  await page1.getByLabel('Room code').fill(code);
  await page1.getByRole('button', { name: 'Join by code' }).click();
  await page1.getByText(/^Room: /).waitFor({ timeout: 5000 });
  expect(seatAfter).toBe(seatBefore); // same seat reclaimed

  await Promise.all([
    ctx1.tracing.stop({ path: path.join(artifactDir, 'trace-identity-p1.zip') }),
    ctx2.tracing.stop({ path: path.join(artifactDir, 'trace-identity-p2.zip') }),
  ]);
  await Promise.all([ctx1.close(), ctx2.close()]);
});
