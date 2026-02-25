import { Client, Guild, Role } from "discord.js";

/** System role → Discord role name and color (plan: ADMIN, PROJECT_MANAGER, ELECTRICIAN, PAINTER; schema also has WORKER) */
const ROLE_MAPPINGS: Record<string, { name: string; color: number }> = {
  ADMIN: { name: "Admin", color: 0xe74c3c },
  PROJECT_MANAGER: { name: "Projektledare", color: 0x3498db },
  ELECTRICIAN: { name: "Montör", color: 0x27ae60 },
  PAINTER: { name: "Målare", color: 0xf39c12 },
  WORKER: { name: "Montör", color: 0x27ae60 },
};

const MEMBER_ROLE = { name: "Medlem", color: 0x95a5a6 };

async function getOrCreateRole(
  guild: Guild,
  name: string,
  color: number
): Promise<Role> {
  let role = guild.roles.cache.find((r) => r.name === name);
  if (!role) {
    role = await guild.roles.create({
      name,
      color,
      reason: "Discord integration role sync",
    });
  }
  return role;
}

/**
 * Grant base role (Medlem) and system role to a user after they link Discord.
 */
export async function grantRolesToUser(
  client: Client,
  guildId: string,
  discordUserId: string,
  systemRole: string
): Promise<void> {
  const guild = await client.guilds.fetch(guildId);
  const member = await guild.members.fetch(discordUserId);

  const memberRole = await getOrCreateRole(
    guild,
    MEMBER_ROLE.name,
    MEMBER_ROLE.color
  );
  await member.roles.add(memberRole);

  const roleInfo = ROLE_MAPPINGS[systemRole];
  if (roleInfo) {
    const role = await getOrCreateRole(guild, roleInfo.name, roleInfo.color);
    await member.roles.add(role);
  }
}

/**
 * Remove all managed roles from a user (e.g. when they unlink or are deactivated).
 */
export async function revokeAllRoles(
  client: Client,
  guildId: string,
  discordUserId: string
): Promise<void> {
  const guild = await client.guilds.fetch(guildId);
  const member = await guild.members.fetch(discordUserId).catch(() => null);

  if (member) {
    const allRoleNames = [
      MEMBER_ROLE.name,
      ...Object.values(ROLE_MAPPINGS).map((r) => r.name),
    ];
    const rolesToRemove = member.roles.cache.filter((r) =>
      allRoleNames.includes(r.name)
    );
    await member.roles.remove(rolesToRemove);
  }
}

/**
 * Sync Discord roles when the user's system role changes (remove old system roles, add new).
 */
export async function syncUserRole(
  client: Client,
  guildId: string,
  discordUserId: string,
  newSystemRole: string
): Promise<void> {
  const guild = await client.guilds.fetch(guildId);
  const member = await guild.members.fetch(discordUserId);

  const allSystemRoleNames = Object.values(ROLE_MAPPINGS).map((r) => r.name);
  const oldRoles = member.roles.cache.filter((r) =>
    allSystemRoleNames.includes(r.name)
  );
  await member.roles.remove(oldRoles);

  const roleInfo = ROLE_MAPPINGS[newSystemRole];
  if (roleInfo) {
    const role = await getOrCreateRole(guild, roleInfo.name, roleInfo.color);
    await member.roles.add(role);
  }
}
