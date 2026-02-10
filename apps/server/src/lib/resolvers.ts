import { db } from "@/db";
import { workspaces, notes, folders } from "@/db/schema";
import { eq } from "drizzle-orm";

type DbClient = typeof db;
type TxClient = typeof db extends { transaction: (fn: (tx: infer T) => any) => any } ? T : never;
type AnyDbClient = DbClient | TxClient;

export async function resolveWorkspaceId(slug: string, client: AnyDbClient = db): Promise<number | null> {
  const rows = await client
    .select({ id: workspaces.id })
    .from(workspaces)
    .where(eq(workspaces.slug, slug))
    .limit(1);
  return rows[0]?.id ?? null;
}

export async function resolveNoteId(publicId: string, client: AnyDbClient = db): Promise<number | null> {
  const rows = await client
    .select({ id: notes.id })
    .from(notes)
    .where(eq(notes.publicId, publicId))
    .limit(1);
  return rows[0]?.id ?? null;
}

export async function resolveNote(publicId: string, client: AnyDbClient = db) {
  const rows = await client
    .select({ id: notes.id, content: notes.content, workspaceId: notes.workspaceId })
    .from(notes)
    .where(eq(notes.publicId, publicId))
    .limit(1);
  return rows[0] ?? null;
}

export async function resolveFolderId(publicId: string, client: AnyDbClient = db): Promise<number | null> {
  const rows = await client
    .select({ id: folders.id })
    .from(folders)
    .where(eq(folders.publicId, publicId))
    .limit(1);
  return rows[0]?.id ?? null;
}
