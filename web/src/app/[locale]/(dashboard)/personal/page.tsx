import { Suspense } from "react";
import { setRequestLocale } from "next-intl/server";

export const dynamic = "force-dynamic";

import { getPersonalNotes, getPersonalFiles } from "@/actions/personal";
import { PersonalView } from "@/components/personal/personal-view";

type Props = {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ tab?: string }>;
};

async function PersonalContent({
  initialTab,
}: {
  initialTab?: "overview" | "notes" | "files";
}) {
  const [notesResult, filesResult] = await Promise.all([
    getPersonalNotes(),
    getPersonalFiles(),
  ]);

  const notes = notesResult.success ? notesResult.notes : [];
  const files = filesResult.success ? filesResult.files : [];

  return <PersonalView notes={notes} files={files} initialTab={initialTab} />;
}

export default async function PersonalPage({ params, searchParams }: Props) {
  const { locale } = await params;
  const { tab } = await searchParams;
  setRequestLocale(locale);

  const validTabs = new Set(["overview", "notes", "files"]);
  const initialTab =
    tab && validTabs.has(tab)
      ? (tab as "overview" | "notes" | "files")
      : undefined;

  return (
    <Suspense
      fallback={
        <div className="flex h-64 items-center justify-center">
          <div className="size-8 animate-spin rounded-full border-4 border-muted border-t-primary" />
        </div>
      }
    >
      <PersonalContent initialTab={initialTab} />
    </Suspense>
  );
}
