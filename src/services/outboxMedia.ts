import type { ChatAttachment } from '../api/chat';

// Files waiting in the chat outbox. A voice note, photo, video or document sent with no connection
// is copied here at once and goes out when the connection returns — WhatsApp's model: the message
// shows straight away with a clock and is delivered later, instead of failing with "check your
// connection" (Afshin, 2026-11-19). Kept under the document directory, not the cache, so the OS
// cannot clear a file that has not been sent yet, and it survives the app being closed.
//
// Paths are stored RELATIVE to the document directory: on iOS the app's container path can change
// between launches (an app update moves it), which would orphan an absolute path saved in the outbox.
//
// Lazy + fail-safe filesystem, the same pattern as chatDb: dynamic-imported on first use so the store
// (and its tests) never load the native module just by importing this file.
type FsModule = typeof import('expo-file-system/legacy');
let fsModule: FsModule | null = null;
const fs = async (): Promise<FsModule | null> => {
  if (fsModule) return fsModule;
  try { fsModule = await import('expo-file-system/legacy'); return fsModule; } catch { return null; }
};

const OUTBOX_DIR = 'chat-outbox/';
/** An absolute URI or path (file://, content://, /…) rather than one relative to the document dir. */
const isAbsolute = (p: string): boolean => /^[a-z][a-z0-9+.-]*:/i.test(p) || p.startsWith('/');

/** Copy a picked or recorded file into the outbox folder; returns the path the outbox keeps. If the
 *  copy fails the original URI is kept: it still works while the app stays open. */
export async function keepForOutbox(clientId: string, file: { uri: string; name: string }): Promise<string> {
  const FS = await fs();
  if (!FS?.documentDirectory) return file.uri;
  const ext = /\.[A-Za-z0-9]{1,8}$/.exec(file.name)?.[0] ?? '';
  const rel = `${OUTBOX_DIR}${clientId}${ext}`;
  try {
    await FS.makeDirectoryAsync(`${FS.documentDirectory}${OUTBOX_DIR}`, { intermediates: true }).catch(() => undefined);
    await FS.copyAsync({ from: file.uri, to: `${FS.documentDirectory}${rel}` });
    return rel;
  } catch {
    return file.uri;
  }
}

/** The file:// URI an outbox path points at today. */
export async function outboxFileUri(path: string): Promise<string> {
  if (isAbsolute(path)) return path;
  const FS = await fs();
  return `${FS?.documentDirectory ?? ''}${path}`;
}

/** Sent: move the file into the downloaded-media folder under the server copy's name, so the sender
 *  opens and plays their own photo or voice note from the phone instead of downloading it back. */
export async function settleOutboxFile(path: string, sent: ChatAttachment): Promise<void> {
  if (isAbsolute(path)) return; // not ours to move (the copy failed and the picker's file was used)
  const FS = await fs();
  if (!FS?.documentDirectory) return;
  const from = `${FS.documentDirectory}${path}`;
  try {
    const { MEDIA_DIR, localPathFor } = await import('./attachments');
    await FS.makeDirectoryAsync(MEDIA_DIR, { intermediates: true }).catch(() => undefined);
    await FS.moveAsync({ from, to: localPathFor(sent) });
  } catch {
    await FS.deleteAsync(from, { idempotent: true }).catch(() => undefined);
  }
}

/** The message will never be sent (chat deleted, task closed): free the file. */
export async function dropOutboxFile(path: string): Promise<void> {
  if (isAbsolute(path)) return;
  const FS = await fs();
  if (!FS?.documentDirectory) return;
  await FS.deleteAsync(`${FS.documentDirectory}${path}`, { idempotent: true }).catch(() => undefined);
}

/** Sign-out: nothing queued survives the account. */
export async function clearOutboxFiles(): Promise<void> {
  const FS = await fs();
  if (!FS?.documentDirectory) return;
  await FS.deleteAsync(`${FS.documentDirectory}${OUTBOX_DIR}`, { idempotent: true }).catch(() => undefined);
}
