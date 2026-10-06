// How a reminder's text is shown once it is saved. The composer stores "@Name" tokens (the '@' is
// what opens the people picker, and KBiz Books + the push text carry the same string), but in a
// task list the symbol is noise: the highlight is what marks the person. Pure string math.
import { splitMentions, type MentionSegment } from './mentions';

type Named = { forName?: string | null; byName?: string | null };

// Names a reminder's text can mention: its assignee and creator (always known — even offline and
// for reminders written in KBiz Books) plus whoever the directory lists. Deduplicated, trimmed.
export function reminderMentionNames(r: Named, directoryNames: Array<string | null | undefined> = []): string[] {
  const out: string[] = [];
  for (const raw of [r.forName, r.byName, ...directoryNames]) {
    const name = (raw ?? '').trim();
    if (name && !out.includes(name)) out.push(name);
  }
  return out;
}

// Segments for rendering: a mention keeps the person's name WITHOUT the leading '@'. Plain
// stretches are untouched, so the sentence still reads as typed.
export function reminderDisplaySegments(text: string, names: string[]): MentionSegment[] {
  return splitMentions(text, names).map((seg) => (seg.mention ? { text: seg.text.slice(1), mention: true } : seg));
}
