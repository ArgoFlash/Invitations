require('dotenv').config();
const {
  Client,
  GatewayIntentBits,
  Collection,
  Events,
} = require('discord.js');
const { upsertInvites } = require('./src/db');
const {
  handleLeaderboard,
  handleTopInviter,
  handleInvites,
} = require('./src/commands');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildInvites,
  ],
});

const guildInvites = new Collection();

async function cacheGuildInvites(guild) {
  try {
    const invites = await guild.invites.fetch();
    guildInvites.set(
      guild.id,
      new Collection(invites.map(inv => [inv.code, inv.uses])),
    );
  } catch (err) {
    console.error(`Impossible de récupérer les invites pour ${guild.name}:`, err.message);
  }
}

client.once(Events.ClientReady, async () => {
  console.log(`Connecté en tant que ${client.user.tag}`);

  for (const [, guild] of client.guilds.cache) {
    await cacheGuildInvites(guild);
  }
  console.log(`Cache d'invites initialisé pour ${guildInvites.size} serveur(s)`);
});

client.on(Events.InviteCreate, async invite => {
  if (!invite.guild) return;
  const cached = guildInvites.get(invite.guild.id) ?? new Collection();
  cached.set(invite.code, invite.uses);
  guildInvites.set(invite.guild.id, cached);
});

client.on(Events.InviteDelete, async invite => {
  if (!invite.guild) return;
  const cached = guildInvites.get(invite.guild.id);
  if (cached) cached.delete(invite.code);
});

client.on(Events.GuildMemberAdd, async member => {
  const { guild } = member;
  const cachedInvites = guildInvites.get(guild.id);
  if (!cachedInvites) return;

  let newInvites;
  try {
    newInvites = await guild.invites.fetch();
  } catch {
    return;
  }

  const usedInvite = newInvites.find(inv => {
    const oldUses = cachedInvites.get(inv.code) ?? 0;
    return inv.uses > oldUses;
  });

  guildInvites.set(
    guild.id,
    new Collection(newInvites.map(inv => [inv.code, inv.uses])),
  );

  if (!usedInvite?.inviter) return;

  const inviterId = usedInvite.inviter.id;

  const allInvites = newInvites.filter(inv => inv.inviter?.id === inviterId);
  const total = allInvites.reduce((sum, inv) => sum + inv.uses, 0);
  const members = await guild.members.fetch();
  const active = allInvites.reduce((sum, inv) => {
    const invitedMembers = members.filter(m => !m.user.bot);
    return sum + Math.min(inv.uses, invitedMembers.size);
  }, 0);

  upsertInvites(guild.id, inviterId, total, active);

  console.log(`${member.user.tag} a rejoint via l'invite de ${usedInvite.inviter.tag} (total: ${total})`);
});

client.on(Events.GuildMemberRemove, async member => {
  const { guild } = member;
  try {
    const invites = await guild.invites.fetch();
    guildInvites.set(
      guild.id,
      new Collection(invites.map(inv => [inv.code, inv.uses])),
    );

    const inviterIds = new Set(
      invites.filter(inv => inv.inviter).map(inv => inv.inviter.id),
    );

    const members = await guild.members.fetch();

    for (const inviterId of inviterIds) {
      const userInvites = invites.filter(inv => inv.inviter?.id === inviterId);
      const total = userInvites.reduce((sum, inv) => sum + inv.uses, 0);
      const activeMembers = members.filter(m => !m.user.bot);
      const active = Math.min(total, activeMembers.size);
      upsertInvites(guild.id, inviterId, total, active);
    }
  } catch (err) {
    console.error('Erreur lors de la mise à jour après départ:', err.message);
  }
});

client.on(Events.InteractionCreate, async interaction => {
  if (!interaction.isChatInputCommand()) return;

  try {
    switch (interaction.commandName) {
      case 'leaderboard':
        await handleLeaderboard(interaction);
        break;
      case 'topinviter':
        await handleTopInviter(interaction);
        break;
      case 'invites':
        await handleInvites(interaction);
        break;
      default:
        await interaction.reply({ content: 'Commande inconnue.', ephemeral: true });
    }
  } catch (err) {
    console.error(`Erreur commande /${interaction.commandName}:`, err);
    const reply = { content: 'Une erreur est survenue.', ephemeral: true };
    if (interaction.replied || interaction.deferred) {
      await interaction.followUp(reply);
    } else {
      await interaction.reply(reply);
    }
  }
});

client.login(process.env.DISCORD_TOKEN);
