"use client";

import { useState, useTransition, useRef } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { createProject } from "@/actions/projects";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Plus } from "lucide-react";

export function CreateProjectDialog() {
  const t = useTranslations("projects");
  const tc = useTranslations("common");
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const formRef = useRef<HTMLFormElement>(null);

  function handleSubmit(formData: FormData) {
    setError(null);

    startTransition(async () => {
      const result = await createProject(formData);

      if (result.success) {
        setOpen(false);
        formRef.current?.reset();
        router.refresh();
        return;
      }

      if (result.fieldErrors) {
        const firstError = Object.values(result.fieldErrors).flat()[0];
        setError(firstError ?? t("errorGeneric"));
      } else {
        setError(t("errorGeneric"));
      }
    });
  }

  function handleOpenChange(nextOpen: boolean) {
    setOpen(nextOpen);
    if (!nextOpen) {
      setError(null);
      formRef.current?.reset();
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button>
          <Plus />
          {t("createProject")}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[100dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t("createProjectTitle")}</DialogTitle>
          <DialogDescription>
            {t("createProjectDescription")}
          </DialogDescription>
        </DialogHeader>

        <form ref={formRef} action={handleSubmit} className="space-y-4">
          {error && (
            <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
              {error}
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="project-name">{t("name")}</Label>
            <Input
              id="project-name"
              name="name"
              placeholder={t("namePlaceholder")}
              required
              disabled={isPending}
              maxLength={200}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="project-description">
              {t("projectDescription")}
            </Label>
            <Textarea
              id="project-description"
              name="description"
              placeholder={t("descriptionPlaceholder")}
              disabled={isPending}
              maxLength={2000}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="project-address">{t("address")}</Label>
            <Input
              id="project-address"
              name="address"
              placeholder={t("addressPlaceholder")}
              disabled={isPending}
              maxLength={500}
            />
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => handleOpenChange(false)}
              disabled={isPending}
            >
              {tc("cancel")}
            </Button>
            <Button type="submit" disabled={isPending}>
              {isPending ? t("creating") : t("createProject")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
