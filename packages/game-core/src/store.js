// Durable, append-only persistence for game outcomes and achievement unlocks.
// Matches the gateway's zero-infrastructure style: plain JSON files written
// synchronously alongside the server. The pure aggregation over these records
// lives in @portal/shared/leaderboard; this module is only I/O + dedup.

import { readFileSync, writeFileSync, mkdirSync, readdirSync, unlinkSync } from 'node:fs';
import crypto from 'node:crypto';

function load(filePath, fallback) {
  try {
    return JSON.parse(readFileSync(filePath, 'utf8'));
  } catch {
    return fallback;
  }
}

// One append-only log of finished games. Every leaderboard scope, the match
// history, and head-to-head records are all derived from these same records.
export class OutcomeStore {
  constructor(filePath = './outcomes.json') {
    this.filePath = filePath;
    this.records = load(filePath, []);
  }

  // outcomes: [{ playerId, rank, score, meta }]
  record({ gameId, roomCode, outcomes }) {
    const entry = { id: crypto.randomUUID(), gameId, roomCode, ts: Date.now(), outcomes };
    this.records.push(entry);
    writeFileSync(this.filePath, JSON.stringify(this.records, null, 2));
    return entry;
  }

  all() {
    return this.records;
  }
}

// Generic {playerId, achievementId} unlock store. Games declare the conditions;
// the framework records the unlock here. Recording is idempotent per player.
export class AchievementStore {
  constructor(filePath = './achievements.json') {
    this.filePath = filePath;
    this.unlocks = load(filePath, []);
  }

  // Returns true if newly unlocked, false if the player already had it.
  record({ playerId, achievementId, gameId }) {
    if (this.unlocks.some((u) => u.playerId === playerId && u.achievementId === achievementId)) {
      return false;
    }
    this.unlocks.push({ playerId, achievementId, gameId, ts: Date.now() });
    writeFileSync(this.filePath, JSON.stringify(this.unlocks, null, 2));
    return true;
  }

  forPlayer(playerId) {
    return this.unlocks.filter((u) => u.playerId === playerId);
  }
}

// Per-room state snapshots, one JSON file per room code. The persistence seam
// that lets a restart resume in-flight rooms instead of discarding them.
export class SnapshotStore {
  constructor(dir = './snapshots') {
    this.dir = dir;
    mkdirSync(dir, { recursive: true });
  }

  save(code, snapshot) {
    writeFileSync(`${this.dir}/${code}.json`, JSON.stringify(snapshot));
  }

  load(code) {
    return JSON.parse(readFileSync(`${this.dir}/${code}.json`, 'utf8'));
  }

  list() {
    try {
      return readdirSync(this.dir).filter((f) => f.endsWith('.json')).map((f) => f.slice(0, -5));
    } catch {
      return [];
    }
  }

  delete(code) {
    try {
      unlinkSync(`${this.dir}/${code}.json`);
    } catch {}
  }
}
