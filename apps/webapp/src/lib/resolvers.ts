import { db } from "@/db";
import { notes, folders, workspaces } from "@kontexted/db";
import { eq } from "drizzle-orm";

type DbClient = typeof db;
type TxClient = typeof db extends { transaction: (fn: (tx: infer T) => any) => any } ? T : never;
type AnyDbClient = DbClient | TxClient;

export const resolveNoteId = async (
  publicId: string,
  client: AnyDbClient = db
) => {
  const note = await client
    .select({ id: notes.id })
    .from(notes)
    .where(eq(notes.publicId, publicId))
    .limit(1);

  return note[0]?.id ?? null;
};

export const resolveNote = async (
  publicId: string,
  client: AnyDbClient = db
) => {
  const note = await client
    .select({ id: notes.id, content: notes.content, workspaceId: notes.workspaceId })
    .from(notes)
    .where(eq(notes.publicId, publicId))
    .limit(1);

  return note[0] ?? null;
};

export const resolveFolderId = async (
  publicId: string,
  client: AnyDbClient = db
) => {
  const folder = await client
    .select({ id: folders.id })
    .from(folders)
    .where(eq(folders.publicId, publicId))
    .limit(1);

  return folder[0]?.id ?? null;
};

export const resolveWorkspaceId = async (
  slug: string,
  client: AnyDbClient = db
) => {
  const workspace = await client
    .select({ id: workspaces.id })
    .from(workspaces)
    .where(eq(workspaces.slug, slug))
    .limit(1);

  return workspace[0]?.id ?? null;
};
