export type SavedBoard = {
  id: string;
  title: string;
  mode: "compare" | "roadmap";
  graph: unknown;
  savedAt: number;
};

const KEY_PREFIX = "kanshan.library.v1";
const MAX = 20;

export type LibraryCapabilities = { localOnly: true; cloudSync: false; serverPersistence: false };
export const libraryCapabilities: LibraryCapabilities = { localOnly: true, cloudSync: false, serverPersistence: false };

export function savedBoardKey(accountNamespace = "device"): string {
  const safe = accountNamespace.trim().replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 80) || "device";
  return `${KEY_PREFIX}:${safe}`;
}

export function stableBoardId(accountNamespace: string, mode: SavedBoard["mode"], title: string): string {
  const input = `${accountNamespace}\u0000${mode}\u0000${title.trim().toLowerCase()}`;
  let hash = 2166136261;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `board-${(hash >>> 0).toString(16).padStart(8, "0")}`;
}

export function listSavedBoards(storage: Pick<Storage, "getItem"> | null, accountNamespace = "device"): SavedBoard[] {
  if (!storage) return [];
  try {
    const value = JSON.parse(storage.getItem(savedBoardKey(accountNamespace)) || "[]");
    return Array.isArray(value) ? value.filter((item) => item && typeof item.id === "string" && item.graph) : [];
  } catch { return []; }
}

export function saveBoard(storage: Pick<Storage, "getItem" | "setItem"> | null, board: SavedBoard, accountNamespace = "device"): SavedBoard[] {
  if (!storage) return [];
  const next = [board, ...listSavedBoards(storage, accountNamespace).filter((item) => item.id !== board.id)].slice(0, MAX);
  storage.setItem(savedBoardKey(accountNamespace), JSON.stringify(next));
  return next;
}

export function deleteBoard(storage: Pick<Storage, "getItem" | "setItem"> | null, id: string, accountNamespace = "device"): SavedBoard[] {
  if (!storage) return [];
  const next = listSavedBoards(storage, accountNamespace).filter((item) => item.id !== id);
  storage.setItem(savedBoardKey(accountNamespace), JSON.stringify(next));
  return next;
}
