import { openDB, type DBSchema, type IDBPDatabase } from "idb";
import type { Session } from "../types";

interface WebBpmDB extends DBSchema {
  sessions: {
    key: string;
    value: Session;
    indexes: {
      "by-created": Date;
    };
  };
}

const DB_NAME = "web-bpm";
const DB_VERSION = 1;

let dbPromise: Promise<IDBPDatabase<WebBpmDB>> | null = null;

function getDb(): Promise<IDBPDatabase<WebBpmDB>> {
  if (!dbPromise) {
    dbPromise = openDB<WebBpmDB>(DB_NAME, DB_VERSION, {
      upgrade(db) {
        const store = db.createObjectStore("sessions", { keyPath: "id" });
        store.createIndex("by-created", "createdAt");
      },
    });
  }
  return dbPromise;
}

export async function saveSession(session: Session): Promise<void> {
  const db = await getDb();
  await db.put("sessions", session);
}

export async function getAllSessions(): Promise<Session[]> {
  const db = await getDb();
  const sessions = await db.getAllFromIndex("sessions", "by-created");
  return sessions.reverse();
}

export async function getSession(id: string): Promise<Session | undefined> {
  const db = await getDb();
  return db.get("sessions", id);
}

export async function deleteSession(id: string): Promise<void> {
  const db = await getDb();
  await db.delete("sessions", id);
}

export async function toggleSessionStarred(id: string): Promise<boolean> {
  const db = await getDb();
  const session = await db.get("sessions", id);
  if (!session) return false;
  session.starred = !session.starred;
  await db.put("sessions", session);
  return session.starred;
}

export async function deleteUnstarredSessions(): Promise<number> {
  const db = await getDb();
  const all = await db.getAll("sessions");
  const toDelete = all.filter((s) => !s.starred);
  const tx = db.transaction("sessions", "readwrite");
  for (const s of toDelete) {
    void tx.store.delete(s.id);
  }
  await tx.done;
  return toDelete.length;
}

export async function getSessionsStorageBreakdown(): Promise<{
  totalBytes: number;
  sessionCount: number;
  audioBytes: number;
  audioCount: number;
}> {
  const db = await getDb();
  const all = await db.getAll("sessions");
  let totalBytes = 0;
  let audioBytes = 0;
  let audioCount = 0;
  for (const s of all) {
    // Rough estimate: JSON size of metadata + time series
    const metaSize = new Blob([JSON.stringify({ ...s, audioBlob: undefined })]).size;
    const blobSize = s.audioBlob?.size ?? 0;
    totalBytes += metaSize + blobSize;
    if (blobSize > 0) {
      audioBytes += blobSize;
      audioCount++;
    }
  }
  return { totalBytes, sessionCount: all.length, audioBytes, audioCount };
}
