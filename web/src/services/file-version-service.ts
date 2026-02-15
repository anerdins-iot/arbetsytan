import type { TenantScopedClient } from "@/lib/db";

export type FileVersionItem = {
  id: string;
  name: string;
  versionNumber: number;
  createdAt: Date;
  size: number;
};

/**
 * Hämta versionshistorik för en fil: går uppåt till original, sedan nedåt till alla barn.
 * Returnerar versioner sorterade efter versionNumber (1, 2, 3, …).
 */
export async function getFileVersionHistory(
  db: TenantScopedClient,
  fileId: string
): Promise<FileVersionItem[]> {
  const file = await db.file.findUnique({
    where: { id: fileId },
    select: { id: true, parentFileId: true, versionNumber: true },
  });

  if (!file) {
    return [];
  }

  // Gå uppåt till roten (original)
  let rootId = fileId;
  let current: { id: string; parentFileId: string | null } = file;
  while (current.parentFileId) {
    const parent = await db.file.findUnique({
      where: { id: current.parentFileId },
      select: { id: true, parentFileId: true, versionNumber: true },
    });
    if (!parent) break;
    rootId = parent.id;
    current = parent;
  }

  // Hämta alla filer i versionkedjan (roten + alla barn; kedjan är linjär)
  const chain = await collectVersionChain(db, rootId);
  return chain.sort((a, b) => a.versionNumber - b.versionNumber);
}

async function collectVersionChain(
  db: TenantScopedClient,
  rootId: string
): Promise<FileVersionItem[]> {
  const file = await db.file.findUnique({
    where: { id: rootId },
    select: {
      id: true,
      name: true,
      versionNumber: true,
      createdAt: true,
      size: true,
    },
  });

  if (!file) {
    return [];
  }

  const result: FileVersionItem[] = [
    {
      id: file.id,
      name: file.name,
      versionNumber: file.versionNumber,
      createdAt: file.createdAt,
      size: file.size,
    },
  ];

  const children = await db.file.findMany({
    where: { parentFileId: rootId },
    select: {
      id: true,
      name: true,
      versionNumber: true,
      createdAt: true,
      size: true,
    },
  });

  for (const child of children) {
    result.push(
      ...(await collectVersionChain(db, child.id))
    );
  }

  return result;
}
