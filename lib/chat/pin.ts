// Phase 0 / P5 — pinned conversations sorting helpers.
//
// These are deliberately split out as pure functions so they can be
// covered by unit tests independently of the React/SWR layer.

export type PinnableChat = {
  id: string;
  pinnedAt: Date | string | null | undefined;
  createdAt: Date | string;
};

export function isPinned(chat: PinnableChat): boolean {
  return chat.pinnedAt !== null && chat.pinnedAt !== undefined;
}

function timeOf(value: Date | string | null | undefined): number {
  if (!value) {
    return 0;
  }
  return value instanceof Date ? value.getTime() : new Date(value).getTime();
}

/**
 * Split a list of chats into [pinned, rest].
 *
 * - Pinned chats are sorted by `pinnedAt` desc (most recently pinned first).
 * - The `rest` array preserves the input order (caller controls the secondary
 *   sort, e.g. date-grouping in the sidebar).
 */
export function partitionPinned<T extends PinnableChat>(
  chats: T[]
): { pinned: T[]; rest: T[] } {
  const pinned: T[] = [];
  const rest: T[] = [];
  for (const chat of chats) {
    if (isPinned(chat)) {
      pinned.push(chat);
    } else {
      rest.push(chat);
    }
  }
  pinned.sort((a, b) => timeOf(b.pinnedAt) - timeOf(a.pinnedAt));
  return { pinned, rest };
}
