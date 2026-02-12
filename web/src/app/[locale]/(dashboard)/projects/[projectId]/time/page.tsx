import { redirect } from "next/navigation";

type Props = {
  params: Promise<{ locale: string; projectId: string }>;
};

export default async function ProjectTimePage({ params }: Props) {
  const { locale, projectId } = await params;
  redirect(`/${locale}/projects/${projectId}?tab=time`);
}
