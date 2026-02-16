"use client";

import { useMemo, useState, useTransition } from "react";
import { useTheme } from "next-themes";
import { useTranslations } from "next-intl";
import { usePathname, useRouter } from "@/i18n/routing";
import type { UserNotificationPreferences } from "@/actions/notifications";
import {
  updateNotificationPreferences,
  type UserNotificationPreferences as UserNotificationPreferencesType,
} from "@/actions/notifications";
import {
  changePassword,
  completeProfileImageUpload,
  prepareProfileImageUpload,
  updateUserLocale,
  updateProfile,
  type ProfileData,
} from "@/actions/profile";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type Props = {
  initialProfile: ProfileData;
  initialNotificationPreferences: UserNotificationPreferences;
};

type EventKey = keyof UserNotificationPreferencesType;

const EVENT_KEYS: EventKey[] = ["taskAssigned", "deadlineSoon", "projectStatusChanged"];

export function ProfileSettings({ initialProfile, initialNotificationPreferences }: Props) {
  const t = useTranslations("settings.profile");
  const router = useRouter();
  const pathname = usePathname();
  const { theme, setTheme } = useTheme();

  const [isProfilePending, startProfileTransition] = useTransition();
  const [isPasswordPending, startPasswordTransition] = useTransition();
  const [isNotificationPending, startNotificationTransition] = useTransition();
  const [isLanguagePending, startLanguageTransition] = useTransition();
  const [isAvatarPending, startAvatarTransition] = useTransition();

  const [profileName, setProfileName] = useState(initialProfile.name);
  const [profileEmail, setProfileEmail] = useState(initialProfile.email);
  const [profilePhone, setProfilePhone] = useState(initialProfile.phone ?? "");
  const [profileBio, setProfileBio] = useState(initialProfile.bio ?? "");
  const [profileMessage, setProfileMessage] = useState<string | null>(null);
  const [profileError, setProfileError] = useState<string | null>(null);

  const [avatarUrl, setAvatarUrl] = useState<string | null>(initialProfile.imageUrl);
  const [avatarError, setAvatarError] = useState<string | null>(null);

  const [passwordMessage, setPasswordMessage] = useState<string | null>(null);
  const [passwordError, setPasswordError] = useState<string | null>(null);

  const [notificationPreferences, setNotificationPreferences] = useState(
    initialNotificationPreferences
  );
  const [notificationError, setNotificationError] = useState<string | null>(null);
  const [notificationMessage, setNotificationMessage] = useState<string | null>(null);

  const [locale, setLocale] = useState<"sv" | "en">(initialProfile.locale);
  const [localeError, setLocaleError] = useState<string | null>(null);

  const isDarkMode = theme === "dark";
  const initials = useMemo(() => {
    const source = profileName || profileEmail;
    const parts = source.trim().split(/\s+/).filter(Boolean);
    if (parts.length === 0) return "AY";
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return `${parts[0][0] ?? ""}${parts[1][0] ?? ""}`.toUpperCase();
  }, [profileName, profileEmail]);

  function mapProfileError(error: string | undefined): string {
    if (error === "EMAIL_IN_USE") return t("profile.errors.emailInUse");
    return t("profile.errors.generic");
  }

  function mapPasswordError(error: string | undefined): string {
    if (error === "INVALID_INPUT") return t("password.errors.invalidInput");
    if (error === "PASSWORD_MISMATCH") return t("password.errors.passwordMismatch");
    if (error === "CURRENT_PASSWORD_INVALID") return t("password.errors.currentPasswordInvalid");
    if (error === "PASSWORD_NOT_SET") return t("password.errors.passwordNotSet");
    return t("password.errors.generic");
  }

  function mapAvatarError(error: string | undefined): string {
    if (error === "FILE_TOO_LARGE") return t("profile.errors.avatarTooLarge");
    if (error === "FILE_TYPE_NOT_ALLOWED") return t("profile.errors.avatarType");
    return t("profile.errors.avatarGeneric");
  }

  async function handleProfileSubmit(formData: FormData) {
    setProfileError(null);
    setProfileMessage(null);
    formData.set("phone", profilePhone);
    formData.set("bio", profileBio);
    startProfileTransition(async () => {
      const result = await updateProfile(formData);
      if (!result.success) {
        setProfileError(mapProfileError(result.error));
        return;
      }
      setProfileMessage(t("profile.saved"));
      router.refresh();
    });
  }

  async function handlePasswordSubmit(formData: FormData) {
    setPasswordError(null);
    setPasswordMessage(null);
    startPasswordTransition(async () => {
      const result = await changePassword(formData);
      if (!result.success) {
        setPasswordError(mapPasswordError(result.error));
        return;
      }
      setPasswordMessage(t("password.saved"));
    });
  }

  function persistNotificationPreferences(next: UserNotificationPreferences) {
    setNotificationPreferences(next);
    setNotificationError(null);
    setNotificationMessage(null);
    startNotificationTransition(async () => {
      const result = await updateNotificationPreferences(next);
      if (!result.success) {
        setNotificationError(t("notifications.errors.generic"));
        return;
      }
      setNotificationMessage(t("notifications.saved"));
    });
  }

  function updateEmailPreference(event: EventKey, value: boolean) {
    persistNotificationPreferences({
      ...notificationPreferences,
      [event]: {
        ...notificationPreferences[event],
        email: value,
      },
    });
  }

  function updatePushPreference(value: boolean) {
    persistNotificationPreferences({
      taskAssigned: { ...notificationPreferences.taskAssigned, push: value },
      deadlineSoon: { ...notificationPreferences.deadlineSoon, push: value },
      projectStatusChanged: { ...notificationPreferences.projectStatusChanged, push: value },
    });
  }

  function handleThemeToggle(checked: boolean) {
    setTheme(checked ? "dark" : "light");
  }

  function handleLocaleChange(nextLocale: "sv" | "en") {
    setLocale(nextLocale);
    setLocaleError(null);
    startLanguageTransition(async () => {
      const result = await updateUserLocale({ locale: nextLocale });
      if (!result.success) {
        setLocaleError(t("language.errors.generic"));
        return;
      }
      router.replace(pathname, { locale: nextLocale });
      router.refresh();
    });
  }

  function handleAvatarSelected(file: File | null) {
    setAvatarError(null);
    if (!file) {
      return;
    }

    startAvatarTransition(async () => {
      const prepared = await prepareProfileImageUpload({
        fileName: file.name,
        fileType: file.type,
        fileSize: file.size,
      });
      if (!prepared.success) {
        setAvatarError(mapAvatarError(prepared.error));
        return;
      }

      const uploadResponse = await fetch(prepared.uploadUrl, {
        method: "PUT",
        headers: { "Content-Type": file.type },
        body: file,
      });
      if (!uploadResponse.ok) {
        setAvatarError(t("profile.errors.avatarGeneric"));
        return;
      }

      const completed = await completeProfileImageUpload({
        fileName: file.name,
        fileType: file.type,
        fileSize: file.size,
        bucket: prepared.bucket,
        key: prepared.key,
      });
      if (!completed.success) {
        setAvatarError(mapAvatarError(completed.error));
        return;
      }

      setAvatarUrl(completed.imageUrl);
      router.refresh();
    });
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>{t("profile.title")}</CardTitle>
          <CardDescription>{t("profile.description")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
            <div className="flex h-20 w-20 items-center justify-center overflow-hidden rounded-full border border-border bg-muted text-lg font-semibold text-foreground">
              {avatarUrl ? (
                <img
                  src={avatarUrl}
                  alt={t("profile.avatarAlt")}
                  className="h-full w-full object-cover"
                />
              ) : (
                initials
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="avatar-upload">{t("profile.avatarLabel")}</Label>
              <Input
                id="avatar-upload"
                type="file"
                accept="image/jpeg,image/png,image/webp"
                disabled={isAvatarPending}
                onChange={(event) => {
                  const file = event.target.files?.[0] ?? null;
                  handleAvatarSelected(file);
                }}
              />
              <p className="text-xs text-muted-foreground">{t("profile.avatarHint")}</p>
            </div>
          </div>

          {avatarError ? <p className="text-sm text-destructive">{avatarError}</p> : null}
          {profileError ? <p className="text-sm text-destructive">{profileError}</p> : null}
          {profileMessage ? <p className="text-sm text-foreground">{profileMessage}</p> : null}

          <form action={handleProfileSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="profile-name">{t("profile.name")}</Label>
              <Input
                id="profile-name"
                name="name"
                value={profileName}
                onChange={(event) => setProfileName(event.target.value)}
                maxLength={100}
                required
                disabled={isProfilePending}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="profile-email">{t("profile.email")}</Label>
              <Input
                id="profile-email"
                name="email"
                type="email"
                value={profileEmail}
                onChange={(event) => setProfileEmail(event.target.value)}
                required
                disabled={isProfilePending}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="profile-phone">{t("profile.phone")}</Label>
              <Input
                id="profile-phone"
                name="phone"
                type="tel"
                value={profilePhone}
                onChange={(event) => setProfilePhone(event.target.value)}
                placeholder={t("profile.phonePlaceholder")}
                maxLength={50}
                disabled={isProfilePending}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="profile-bio">{t("profile.bio")}</Label>
              <Textarea
                id="profile-bio"
                name="bio"
                value={profileBio}
                onChange={(event) => setProfileBio(event.target.value)}
                placeholder={t("profile.bioPlaceholder")}
                maxLength={500}
                rows={3}
                disabled={isProfilePending}
              />
            </div>
            <Button type="submit" disabled={isProfilePending}>
              {isProfilePending ? t("profile.saving") : t("profile.save")}
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("password.title")}</CardTitle>
          <CardDescription>{t("password.description")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {passwordError ? <p className="text-sm text-destructive">{passwordError}</p> : null}
          {passwordMessage ? <p className="text-sm text-foreground">{passwordMessage}</p> : null}

          <form action={handlePasswordSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="current-password">{t("password.currentPassword")}</Label>
              <Input
                id="current-password"
                name="currentPassword"
                type="password"
                autoComplete="current-password"
                required
                disabled={isPasswordPending}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="new-password">{t("password.newPassword")}</Label>
              <Input
                id="new-password"
                name="newPassword"
                type="password"
                autoComplete="new-password"
                minLength={8}
                required
                disabled={isPasswordPending}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirm-password">{t("password.confirmPassword")}</Label>
              <Input
                id="confirm-password"
                name="confirmPassword"
                type="password"
                autoComplete="new-password"
                minLength={8}
                required
                disabled={isPasswordPending}
              />
            </div>
            <Button type="submit" disabled={isPasswordPending}>
              {isPasswordPending ? t("password.saving") : t("password.save")}
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("notifications.title")}</CardTitle>
          <CardDescription>{t("notifications.description")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[32rem] border-collapse text-sm">
              <thead>
                <tr className="border-b border-border text-left">
                  <th className="py-2 pr-4 font-medium">{t("notifications.table.event")}</th>
                  <th className="py-2 pr-4 font-medium">{t("notifications.table.inApp")}</th>
                  <th className="py-2 pr-4 font-medium">{t("notifications.table.push")}</th>
                  <th className="py-2 font-medium">{t("notifications.table.email")}</th>
                </tr>
              </thead>
              <tbody>
                {EVENT_KEYS.map((eventKey) => (
                  <tr key={eventKey} className="border-b border-border">
                    <td className="py-3 pr-4">{t(`notifications.events.${eventKey}`)}</td>
                    <td className="py-3 pr-4">
                      <input
                        type="checkbox"
                        className="size-4 rounded border border-input"
                        checked={notificationPreferences[eventKey].inApp}
                        disabled
                        readOnly
                      />
                    </td>
                    <td className="py-3 pr-4">
                      <input
                        type="checkbox"
                        className="size-4 rounded border border-input"
                        checked={notificationPreferences[eventKey].push}
                        onChange={(event) => updatePushPreference(event.target.checked)}
                        disabled={isNotificationPending}
                      />
                    </td>
                    <td className="py-3">
                      <input
                        type="checkbox"
                        className="size-4 rounded border border-input"
                        checked={notificationPreferences[eventKey].email}
                        onChange={(event) => updateEmailPreference(eventKey, event.target.checked)}
                        disabled={isNotificationPending}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <p className="text-xs text-muted-foreground">{t("notifications.pushGlobalHint")}</p>
          {notificationError ? <p className="text-sm text-destructive">{notificationError}</p> : null}
          {notificationMessage ? <p className="text-sm text-foreground">{notificationMessage}</p> : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("appearance.title")}</CardTitle>
          <CardDescription>{t("appearance.description")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <Label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              className="size-4 rounded border border-input"
              checked={isDarkMode}
              onChange={(event) => handleThemeToggle(event.target.checked)}
            />
            <span>{t("appearance.darkMode")}</span>
          </Label>
          <p className="text-xs text-muted-foreground">{t("appearance.hint")}</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("language.title")}</CardTitle>
          <CardDescription>{t("language.description")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="max-w-sm">
            <Label htmlFor="language-select">{t("language.label")}</Label>
            <Select
              value={locale}
              onValueChange={(value) => handleLocaleChange(value as "sv" | "en")}
              disabled={isLanguagePending}
            >
              <SelectTrigger id="language-select" className="mt-2 w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="sv">{t("language.swedish")}</SelectItem>
                <SelectItem value="en">{t("language.english")}</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {localeError ? <p className="text-sm text-destructive">{localeError}</p> : null}
        </CardContent>
      </Card>
    </div>
  );
}
