import { useTranslations } from "next-intl";
import Image from "next/image";
import {
  KanbanSquare,
  FileText,
  Bot,
  Users,
  Clock,
  Bell,
} from "lucide-react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

const featureKeys = [
  { key: "projectManagement", icon: KanbanSquare, image: "/images/feature-project-management.jpg" },
  { key: "fileManagement", icon: FileText, image: "/images/feature-file-management.jpg" },
  { key: "aiAssistant", icon: Bot, image: "/images/feature-ai-assistant.jpg" },
  { key: "teamCollaboration", icon: Users, image: "/images/feature-team-collaboration.jpg" },
  { key: "timeTracking", icon: Clock, image: "/images/feature-time-tracking.jpg" },
  { key: "notifications", icon: Bell, image: "/images/feature-notifications.jpg" },
] as const;

export function FeaturesSection() {
  const t = useTranslations("landing.features");

  return (
    <section id="features" className="bg-secondary/30 py-16 sm:py-24">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
            {t("title")}
          </h2>
          <p className="mt-4 text-lg text-muted-foreground">
            {t("description")}
          </p>
        </div>
        <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {featureKeys.map(({ key, icon: Icon, image }) => (
            <Card key={key} className="overflow-hidden border-border bg-card">
              <div className="relative aspect-[4/3]">
                <Image
                  src={image}
                  alt={t(`${key}.title`)}
                  fill
                  className="object-cover"
                  sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
                />
              </div>
              <CardHeader>
                <div className="mb-2 flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                  <Icon className="h-5 w-5 text-primary" />
                </div>
                <CardTitle className="text-lg">{t(`${key}.title`)}</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-muted-foreground">{t(`${key}.description`)}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </section>
  );
}
