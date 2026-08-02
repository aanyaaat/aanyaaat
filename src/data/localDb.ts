import { PGlite } from '@electric-sql/pglite';
import type {
  Chat,
  ChatId,
  Message,
  MessageId,
  ModelId,
} from '@/domain/types';

/**
 * Local, offline-first persistence layer backed by PGlite (Postgres in WASM,
 * stored in IndexedDB). No network access is ever performed.
 */
let dbPromise: Promise<PGlite> | null = null;

export function getDb(): Promise<PGlite> {
  if (!dbPromise) {
    dbPromise = (async () => {
      const db = new PGlite('idb://offlineai');
      await db.exec(SCHEMA_SQL);
      return db;
    })();
  }
  return dbPromise;
}

const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS chats (
  id          TEXT PRIMARY KEY,
  title       TEXT NOT NULL,
  created_at  BIGINT NOT NULL,
  updated_at  BIGINT NOT NULL,
  pinned      BOOLEAN NOT NULL DEFAULT FALSE,
  model_id    TEXT
);

CREATE TABLE IF NOT EXISTS messages (
  id               TEXT PRIMARY KEY,
  chat_id          TEXT NOT NULL REFERENCES chats(id) ON DELETE CASCADE,
  role             TEXT NOT NULL,
  content          TEXT NOT NULL,
  created_at       BIGINT NOT NULL,
  prompt_tokens    INTEGER,
  generated_tokens INTEGER,
  inference_ms     INTEGER,
  tps              REAL
);

CREATE INDEX IF NOT EXISTS idx_messages_chat ON messages(chat_id, created_at);

CREATE TABLE IF NOT EXISTS settings_kv (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS performance_log (
  id               SERIAL PRIMARY KEY,
  model_id         TEXT,
  prompt_tokens    INTEGER,
  generated_tokens INTEGER,
  inference_ms     INTEGER,
  tps              REAL,
  ram_mb           REAL,
  cpu_percent      REAL,
  gpu_percent      REAL,
  battery_percent REAL,
  sampled_at      BIGINT NOT NULL
);
`;

/* ------------------------------ chats ------------------------------ */

export async function insertChat(chat: Chat): Promise<void> {
  const db = await getDb();
  await db.query(
    `INSERT INTO chats (id, title, created_at, updated_at, pinned, model_id)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [chat.id, chat.title, chat.createdAt, chat.updatedAt, chat.pinned, chat.modelId],
  );
}

export async function updateChat(
  id: ChatId,
  patch: Partial<Pick<Chat, 'title' | 'updatedAt' | 'pinned' | 'modelId'>>,
): Promise<void> {
  const db = await getDb();
  const sets: string[] = [];
  const args: unknown[] = [];
  if (patch.title !== undefined) {
    args.push(patch.title);
    sets.push(`title = $${args.length}`);
  }
  if (patch.updatedAt !== undefined) {
    args.push(patch.updatedAt);
    sets.push(`updated_at = $${args.length}`);
  }
  if (patch.pinned !== undefined) {
    args.push(patch.pinned);
    sets.push(`pinned = $${args.length}`);
  }
  if (patch.modelId !== undefined) {
    args.push(patch.modelId);
    sets.push(`model_id = $${args.length}`);
  }
  if (sets.length === 0) return;
  args.push(id);
  await db.query(`UPDATE chats SET ${sets.join(', ')} WHERE id = $${args.length}`, args);
}

export async function deleteChat(id: ChatId): Promise<void> {
  const db = await getDb();
  await db.query('DELETE FROM chats WHERE id = $1', [id]);
}

export async function listChats(): Promise<Chat[]> {
  const db = await getDb();
  const res = await db.query<Record<string, unknown>>(
    `SELECT id, title, created_at, updated_at, pinned, model_id
     FROM chats ORDER BY pinned DESC, updated_at DESC`,
  );
  return res.rows.map(rowToChat);
}

export async function searchChats(query: string): Promise<Chat[]> {
  const db = await getDb();
  const q = `%${query}%`;
  const res = await db.query<Record<string, unknown>>(
    `SELECT DISTINCT c.id, c.title, c.created_at, c.updated_at, c.pinned, c.model_id
     FROM chats c
     LEFT JOIN messages m ON m.chat_id = c.id
     WHERE c.title ILIKE $1 OR m.content ILIKE $1
     ORDER BY c.pinned DESC, c.updated_at DESC`,
    [q],
  );
  return res.rows.map(rowToChat);
}

/* ----------------------------- messages ---------------------------- */

export async function insertMessage(msg: Message): Promise<void> {
  const db = await getDb();
  await db.query(
    `INSERT INTO messages
       (id, chat_id, role, content, created_at, prompt_tokens, generated_tokens, inference_ms, tps)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
    [
      msg.id,
      msg.chatId,
      msg.role,
      msg.content,
      msg.createdAt,
      msg.promptTokens ?? null,
      msg.generatedTokens ?? null,
      msg.inferenceMs ?? null,
      msg.tokensPerSecond ?? null,
    ],
  );
}

export async function updateMessage(
  id: MessageId,
  patch: Partial<Pick<Message, 'content' | 'promptTokens' | 'generatedTokens' | 'inferenceMs' | 'tokensPerSecond'>>,
): Promise<void> {
  const db = await getDb();
  const sets: string[] = [];
  const args: unknown[] = [];
  if (patch.content !== undefined) {
    args.push(patch.content);
    sets.push(`content = $${args.length}`);
  }
  if (patch.promptTokens !== undefined) {
    args.push(patch.promptTokens);
    sets.push(`prompt_tokens = $${args.length}`);
  }
  if (patch.generatedTokens !== undefined) {
    args.push(patch.generatedTokens);
    sets.push(`generated_tokens = $${args.length}`);
  }
  if (patch.inferenceMs !== undefined) {
    args.push(patch.inferenceMs);
    sets.push(`inference_ms = $${args.length}`);
  }
  if (patch.tokensPerSecond !== undefined) {
    args.push(patch.tokensPerSecond);
    sets.push(`tps = $${args.length}`);
  }
  if (sets.length === 0) return;
  args.push(id);
  await db.query(`UPDATE messages SET ${sets.join(', ')} WHERE id = $${args.length}`, args);
}

export async function deleteMessage(id: MessageId): Promise<void> {
  const db = await getDb();
  await db.query('DELETE FROM messages WHERE id = $1', [id]);
}

export async function deleteMessagesByChat(chatId: ChatId): Promise<void> {
  const db = await getDb();
  await db.query('DELETE FROM messages WHERE chat_id = $1', [chatId]);
}

export async function listMessages(chatId: ChatId): Promise<Message[]> {
  const db = await getDb();
  const res = await db.query<Record<string, unknown>>(
    `SELECT id, chat_id, role, content, created_at, prompt_tokens, generated_tokens, inference_ms, tps
     FROM messages WHERE chat_id = $1 ORDER BY created_at ASC`,
    [chatId],
  );
  return res.rows.map(rowToMessage);
}

export async function searchMessages(query: string): Promise<Message[]> {
  const db = await getDb();
  const res = await db.query<Record<string, unknown>>(
    `SELECT id, chat_id, role, content, created_at, prompt_tokens, generated_tokens, inference_ms, tps
     FROM messages WHERE content ILIKE $1 ORDER BY created_at DESC`,
    [`%${query}%`],
  );
  return res.rows.map(rowToMessage);
}

/* ----------------------------- settings ---------------------------- */

export async function getSetting<T>(key: string, fallback: T): Promise<T> {
  const db = await getDb();
  const res = await db.query<{ value: string }>(
    'SELECT value FROM settings_kv WHERE key = $1',
    [key],
  );
  if (res.rows.length === 0) return fallback;
  try {
    return JSON.parse(res.rows[0].value) as T;
  } catch {
    return fallback;
  }
}

export async function setSetting<T>(key: string, value: T): Promise<void> {
  const db = await getDb();
  await db.query(
    `INSERT INTO settings_kv (key, value) VALUES ($1, $2)
     ON CONFLICT (key) DO UPDATE SET value = $2`,
    [key, JSON.stringify(value)],
  );
}

/* --------------------------- performance --------------------------- */

export async function logPerformance(
  sample: Omit<import('@/domain/types').PerformanceSample, 'sampledAt'> & { sampledAt?: number },
): Promise<void> {
  const db = await getDb();
  await db.query(
    `INSERT INTO performance_log
       (model_id, prompt_tokens, generated_tokens, inference_ms, tps, ram_mb, cpu_percent, gpu_percent, battery_percent, sampled_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
    [
      sample.modelId,
      sample.promptTokens,
      sample.generatedTokens,
      sample.inferenceMs,
      sample.tokensPerSecond,
      sample.ramUsedMb,
      sample.cpuPercent,
      sample.gpuPercent,
      sample.batteryPercent,
      sample.sampledAt ?? Date.now(),
    ],
  );
}

export async function recentPerformance(limit = 20): Promise<import('@/domain/types').PerformanceSample[]> {
  const db = await getDb();
  const res = await db.query<Record<string, unknown>>(
    `SELECT model_id, prompt_tokens, generated_tokens, inference_ms, tps, ram_mb, cpu_percent, gpu_percent, battery_percent, sampled_at
     FROM performance_log ORDER BY sampled_at DESC LIMIT $1`,
    [limit],
  );
  return res.rows.map((r) => ({
    modelId: r.model_id as ModelId | null,
    promptTokens: r.prompt_tokens as number,
    generatedTokens: r.generated_tokens as number,
    inferenceMs: r.inference_ms as number,
    tokensPerSecond: r.tps as number,
    ramUsedMb: r.ram_mb as number,
    cpuPercent: r.cpu_percent as number,
    gpuPercent: r.gpu_percent as number,
    batteryPercent: r.battery_percent as number,
    sampledAt: r.sampled_at as number,
  }));
}

/* ------------------------------ utils ------------------------------ */

function rowToChat(r: Record<string, unknown>): Chat {
  return {
    id: r.id as ChatId,
    title: r.title as string,
    createdAt: r.created_at as number,
    updatedAt: r.updated_at as number,
    pinned: r.pinned as boolean,
    modelId: (r.model_id as ModelId | null) ?? null,
  };
}

function rowToMessage(r: Record<string, unknown>): Message {
  return {
    id: r.id as MessageId,
    chatId: r.chat_id as ChatId,
    role: r.role as Message['role'],
    content: r.content as string,
    createdAt: r.created_at as number,
    promptTokens: (r.prompt_tokens as number | null) ?? undefined,
    generatedTokens: (r.generated_tokens as number | null) ?? undefined,
    inferenceMs: (r.inference_ms as number | null) ?? undefined,
    tokensPerSecond: (r.tps as number | null) ?? undefined,
  };
}

export function uid(): string {
  return (
    Date.now().toString(36) + Math.random().toString(36).slice(2, 10)
  );
}
