// In-memory stand-in for the device filesystem (the real module is native-only). Keyed by full path,
// exactly like expo-file-system: a missing file throws, a missing directory throws on read.
const mockFiles = new Map<string, string>();
jest.mock('expo-file-system/legacy', () => ({
  documentDirectory: 'file:///doc/',
  makeDirectoryAsync: jest.fn(async () => undefined),
  writeAsStringAsync: jest.fn(async (p: string, v: string) => { mockFiles.set(p, v); }),
  readAsStringAsync: jest.fn(async (p: string) => {
    const v = mockFiles.get(p);
    if (v === undefined) throw new Error(`ENOENT: ${p}`);
    return v;
  }),
  readDirectoryAsync: jest.fn(async (dir: string) => {
    const names = [...mockFiles.keys()].filter((k) => k.startsWith(dir)).map((k) => k.slice(dir.length));
    if (!names.length) throw new Error(`ENOENT: ${dir}`);
    return names;
  }),
  deleteAsync: jest.fn(async (p: string) => { for (const k of [...mockFiles.keys()]) if (k.startsWith(p)) mockFiles.delete(k); }),
}), { virtual: true });

import * as chatDb from '../services/chatDb';

interface Msg { id: string; createdAt: string; text: string }
const msg = (n: number, text = `m${n}`): Msg => ({ id: `id-${String(n).padStart(5, '0')}`, createdAt: new Date(Date.UTC(2026, 6, 15, 0, n)).toISOString(), text });
const range = (from: number, to: number): Msg[] => Array.from({ length: to - from }, (_, i) => msg(from + i));
const texts = (list: Msg[]): string[] => list.map((m) => m.text);
const chunkCount = (): number => [...mockFiles.keys()].filter((k) => k.includes('/chat-db/c1/')).length;

beforeEach(async () => {
  await chatDb.clearAll();
  mockFiles.clear();
});

describe('chatDb — the on-device message database', () => {
  it('stores and reads a thread back in order', async () => {
    await chatDb.upsert('c1', range(0, 5));
    expect(texts(await chatDb.readRecent<Msg>('c1', 60))).toEqual(['m0', 'm1', 'm2', 'm3', 'm4']);
  });

  it('returns an empty thread for a conversation that was never opened', async () => {
    expect(await chatDb.readRecent('nope', 60)).toEqual([]);
  });

  it('splits history into chunks and opens a long thread by reading only the newest ones', async () => {
    await chatDb.upsert('c1', range(0, 450)); // CHUNK = 200 → 3 files
    expect(chunkCount()).toBe(3);

    const recent = await chatDb.readRecent<Msg>('c1', 60);
    expect(recent).toHaveLength(60);
    expect(recent[59].text).toBe('m449'); // newest last
    expect(recent[0].text).toBe('m390');
  });

  it('appends new messages without rewriting the whole history', async () => {
    await chatDb.upsert('c1', range(0, 250));
    const before = mockFiles.get('file:///doc/chat-db/c1/0.json');

    await chatDb.upsert('c1', [msg(250)]);

    expect(mockFiles.get('file:///doc/chat-db/c1/0.json')).toBe(before); // chunk 0 untouched
    const recent = await chatDb.readRecent<Msg>('c1', 3);
    expect(texts(recent)).toEqual(['m248', 'm249', 'm250']);
  });

  it('replaces a message in place — an edit never duplicates it', async () => {
    await chatDb.upsert('c1', range(0, 5));
    await chatDb.upsert('c1', [{ ...msg(2), text: 'edited' }]);

    const all = await chatDb.readRecent<Msg>('c1', 60);
    expect(all).toHaveLength(5);
    expect(texts(all)).toEqual(['m0', 'm1', 'edited', 'm3', 'm4']);
  });

  it('finds and updates a message living in an older chunk (socket edit outside the open window)', async () => {
    await chatDb.upsert('c1', range(0, 450));
    chatDb.__resetIndexForTests(); // simulate a fresh launch: nothing indexed in memory yet

    await chatDb.upsert('c1', [{ ...msg(10), text: 'edited-in-chunk-0' }]);

    const page = await chatDb.readOlder<Msg>('c1', 'id-00012', 5);
    expect(texts(page)).toEqual(['m7', 'm8', 'm9', 'edited-in-chunk-0', 'm11']);
  });

  it('pages backwards across a chunk boundary for scrollback', async () => {
    await chatDb.upsert('c1', range(0, 450));

    const first = await chatDb.readRecent<Msg>('c1', 40);
    const older = await chatDb.readOlder<Msg>('c1', first[0].id, 40);
    expect(older).toHaveLength(40);
    expect(older[39].text).toBe('m409'); // exactly the page before the open window
    expect(older[0].text).toBe('m370');

    // Straddling the 200-message file boundary (chunk 1 → chunk 0) must be seamless.
    const straddle = await chatDb.readOlder<Msg>('c1', 'id-00205', 10);
    expect(texts(straddle)).toEqual(['m195', 'm196', 'm197', 'm198', 'm199', 'm200', 'm201', 'm202', 'm203', 'm204']);
  });

  it('reports the top of the thread so scrollback knows when to ask the server', async () => {
    await chatDb.upsert('c1', range(0, 30));
    expect(await chatDb.hasOlder('c1', 'id-00005')).toBe(true);
    expect(await chatDb.hasOlder('c1', 'id-00000')).toBe(false); // nothing older on this device
    expect(await chatDb.readOlder('c1', 'not-a-local-id', 10)).toEqual([]);
  });

  it('deletes messages and whole threads', async () => {
    await chatDb.upsert('c1', range(0, 5));
    await chatDb.removeMessages('c1', ['id-00001', 'id-00003']);
    expect(texts(await chatDb.readRecent<Msg>('c1', 60))).toEqual(['m0', 'm2', 'm4']);

    await chatDb.clearConversation('c1');
    expect(await chatDb.readRecent('c1', 60)).toEqual([]);
  });

  it('wipes every thread on sign-out', async () => {
    await chatDb.upsert('c1', range(0, 5));
    await chatDb.upsert('c2', range(0, 5));

    await chatDb.clearAll();

    expect(await chatDb.readRecent('c1', 60)).toEqual([]);
    expect(await chatDb.readRecent('c2', 60)).toEqual([]);
    expect(mockFiles.size).toBe(0);
  });

  it('survives a corrupt chunk instead of losing the whole thread', async () => {
    await chatDb.upsert('c1', range(0, 250));
    mockFiles.set('file:///doc/chat-db/c1/0.json', '{ this is not json');

    const recent = await chatDb.readRecent<Msg>('c1', 60);
    expect(recent[recent.length - 1].text).toBe('m249'); // chunk 1 still readable
  });

  it('serialises concurrent writes — a socket burst never loses a message', async () => {
    await Promise.all(range(0, 20).map((m) => chatDb.upsert('c1', [m])));
    expect(await chatDb.readRecent<Msg>('c1', 60)).toHaveLength(20);
  });
});

describe('chatDb.search — finding messages without a connection', () => {
  it('matches on text, case-insensitively, newest first', async () => {
    await chatDb.upsert('c1', [msg(1, 'lunch at noon'), msg(2, 'nothing here'), msg(3, 'LUNCH tomorrow')]);

    expect(texts(await chatDb.search<Msg>(['c1'], 'lunch'))).toEqual(['LUNCH tomorrow', 'lunch at noon']);
  });

  it('searches across conversations and orders by time, not by chat', async () => {
    await chatDb.upsert('c1', [msg(1, 'invoice from Kenya')]);
    await chatDb.upsert('c2', [msg(5, 'invoice paid')]);

    expect(texts(await chatDb.search<Msg>(['c1', 'c2'], 'invoice'))).toEqual(['invoice paid', 'invoice from Kenya']);
  });

  it('skips messages deleted for everyone, and empty queries', async () => {
    await chatDb.upsert('c1', [{ ...msg(1, 'secret'), deletedForEveryone: true } as Msg & { deletedForEveryone: boolean }, msg(2, 'secret plan')]);

    expect(texts(await chatDb.search<Msg>(['c1'], 'secret'))).toEqual(['secret plan']);
    expect(await chatDb.search(['c1'], '   ')).toEqual([]);
  });

  it('honours the limit and the chunk budget so search stays responsive', async () => {
    await chatDb.upsert('c1', range(0, 450).map((m) => ({ ...m, text: 'match' })));

    expect(await chatDb.search<Msg>(['c1'], 'match', { limit: 5 })).toHaveLength(5);
    // One chunk of budget = only the newest file is read. 450 messages fill 200 + 200 + 50, so the
    // newest file holds the last 50 — the older 400 are never touched.
    const capped = await chatDb.search<Msg>(['c1'], 'match', { limit: 500, maxChunks: 1 });
    expect(capped).toHaveLength(50);
    expect(capped[0].id).toBe('id-00449');
  });
});

describe('chatDb.usage — what the storage screen reports', () => {
  it('reports size and message count per conversation, biggest first', async () => {
    await chatDb.upsert('small', range(0, 3));
    await chatDb.upsert('big', range(0, 40));

    const usage = await chatDb.usage(['small', 'big']);
    expect(usage.map((u) => u.conversationId)).toEqual(['big', 'small']);
    expect(usage[0]).toMatchObject({ messages: 40 });
    expect(usage[0].bytes).toBeGreaterThan(usage[1].bytes);
  });

  it('omits conversations that store nothing', async () => {
    await chatDb.upsert('c1', range(0, 2));
    expect(await chatDb.usage(['c1', 'never-opened'])).toHaveLength(1);
  });
});
