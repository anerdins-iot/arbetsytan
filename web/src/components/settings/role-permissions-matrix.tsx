"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import {
  type RolePermissions,
  updateRolePermissions,
} from "@/actions/settings";
import type { Permission } from "@/lib/permissions";

type RolePermissionsMatrixProps = {
  permissions: Permission[];
  roles: RolePermissions[];
};

type MatrixState = Record<RolePermissions["role"], Record<Permission, boolean>>;

function roleLabel(
  role: RolePermissions["role"],
  t: ReturnType<typeof useTranslations<"settings.permissions">>
): string {
  switch (role) {
    case "ADMIN":
      return t("roleAdmin");
    case "PROJECT_MANAGER":
      return t("roleProjectManager");
    case "WORKER":
      return t("roleWorker");
    default:
      return role;
  }
}

export function RolePermissionsMatrix({
  permissions,
  roles,
}: RolePermissionsMatrixProps) {
  const t = useTranslations("settings.permissions");
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const initialMatrix = useMemo(() => {
    const matrix = {} as MatrixState;
    for (const role of roles) {
      matrix[role.role] = { ...role.permissions };
    }
    return matrix;
  }, [roles]);
  const [matrix, setMatrix] = useState<MatrixState>(initialMatrix);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setMatrix(initialMatrix);
  }, [initialMatrix]);

  function handlePermissionChange(
    role: RolePermissions["role"],
    permission: Permission,
    checked: boolean
  ) {
    if (role === "ADMIN") {
      return;
    }

    setError(null);
    const previous = matrix;
    const next = {
      ...matrix,
      [role]: {
        ...matrix[role],
        [permission]: checked,
      },
    };

    setMatrix(next);

    startTransition(async () => {
      const result = await updateRolePermissions({
        role,
        permissions: next[role],
      });

      if (!result.success) {
        setMatrix(previous);
        setError(t("errors.saveFailed"));
        return;
      }

      router.refresh();
    });
  }

  const roleOrder: RolePermissions["role"][] = [
    "ADMIN",
    "PROJECT_MANAGER",
    "WORKER",
  ];

  return (
    <div className="rounded-lg border border-border bg-card p-6">
      <h2 className="text-lg font-semibold text-card-foreground">{t("title")}</h2>
      <p className="mt-1 text-sm text-muted-foreground">{t("description")}</p>

      {error ? (
        <div className="mt-4 rounded-md bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </div>
      ) : null}

      <div className="mt-4 overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-border text-left">
              <th className="px-2 py-2 font-medium text-muted-foreground">
                {t("permissionColumn")}
              </th>
              {roleOrder.map((role) => (
                <th
                  key={role}
                  className="px-2 py-2 text-center font-medium text-muted-foreground"
                >
                  {roleLabel(role, t)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {permissions.map((permission) => (
              <tr key={permission} className="border-b border-border last:border-b-0">
                <td className="px-2 py-3 text-card-foreground">
                  {t(`items.${permission}`)}
                </td>
                {roleOrder.map((role) => (
                  <td key={`${permission}-${role}`} className="px-2 py-3 text-center">
                    <input
                      type="checkbox"
                      className="size-4 rounded border border-input"
                      checked={matrix[role]?.[permission] ?? false}
                      onChange={(event) =>
                        handlePermissionChange(role, permission, event.target.checked)
                      }
                      disabled={isPending || role === "ADMIN"}
                    />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="mt-3 text-xs text-muted-foreground">{t("adminFixed")}</p>
    </div>
  );
}
