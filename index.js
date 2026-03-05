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
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

const PREFIX = '?';

const guildInvites = new Collection();

async function syncGuildInvites(guild) {
  try {
    const invites = await guild.invites.fetch();
    guildInvites.set(
      guild.id,
      new Collection(invites.map(inv => [inv.code, inv.uses])),
    );

    const members = await guild.members.fetch();
    const nonBotCount = members.filter(m => !m.user.bot).size;

    const inviterMap = new Map();
    for (const inv of invites.values()) {
      if (!inv.inviter || inv.uses === 0) continue;
      const id = inv.inviter.id;
      const prev = inviterMap.get(id) ?? { total: 0 };
      prev.total += inv.uses;
      inviterMap.set(id, prev);
    }

    for (const [inviterId, data] of inviterMap) {
      const active = Math.min(data.total, nonBotCount);
      upsertInvites(guild.id, inviterId, data.total, active);
    }

    console.log(`[${guild.name}] ${inviterMap.size} inviter(s) synchronisé(s)`);
  } catch (err) {
    console.error(`Impossible de récupérer les invites pour ${guild.name}:`, err.message);
  }
}

client.once(Events.ClientReady, async () => {
  console.log(`Connecté en tant que ${client.user.tag}`);

  for (const [, guild] of client.guilds.cache) {
    await syncGuildInvites(guild);
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

client.on(Events.MessageCreate, async message => {
  if (message.author.bot || !message.content.startsWith(PREFIX)) return;

  const args = message.content.slice(PREFIX.length).trim().split(/\s+/);
  const command = args.shift().toLowerCase();
  const guildId = message.guildId;

  if (!guildId) return;

  try {
    if (command === 'leaderboard') {
      const limit = Math.min(25, Math.max(1, parseInt(args[0]) || 10));
      const { getLeaderboard } = require('./src/db');
      const rows = getLeaderboard(guildId, limit);

      if (!rows.length) {
        return message.reply('Aucune donnée d\'invites pour le moment.');
      }

      const MEDALS = ['🥇', '🥈', '🥉'];
      const lines = rows.map((r, i) => {
        const rank = MEDALS[i] ?? `**${i + 1}.**`;
        return `${rank} <@${r.userId}> — total **${r.total}**, actifs **${r.active}**`;
      });

      const { EmbedBuilder } = require('discord.js');
      const embed = new EmbedBuilder()
        .setTitle(`🏆 Top ${rows.length} inviters`)
        .setDescription(lines.join('\n'))
        .setColor(0xF1C40F)
        .setTimestamp();

      return message.reply({ embeds: [embed] });

    } else if (command === 'topinviter') {
      const { getTopInviter } = require('./src/db');
      const top = getTopInviter(guildId);

      if (!top) {
        return message.reply('Aucune donnée d\'invites pour le moment.');
      }

      const { EmbedBuilder } = require('discord.js');
      const embed = new EmbedBuilder()
        .setTitle('👑 Meilleur inviter')
        .setDescription(`🥇 <@${top.userId}> — total **${top.total}**, actifs **${top.active}**`)
        .setColor(0xE67E22)
        .setTimestamp();

      return message.reply({ embeds: [embed] });

    } else if (command === 'invites') {
      const { getUserInvites } = require('./src/db');
      const data = getUserInvites(guildId, message.author.id);

      if (!data) {
        return message.reply('Tu n\'as encore aucune invitation enregistrée.');
      }

      const { EmbedBuilder } = require('discord.js');
      const embed = new EmbedBuilder()
        .setTitle('📩 Tes invitations')
        .setDescription(`Total : **${data.total}**\nActifs : **${data.active}**`)
        .setColor(0x3498DB)
        .setTimestamp();

      return message.reply({ embeds: [embed] });
    }
  } catch (err) {
    console.error(`Erreur commande ?${command}:`, err);
    message.reply('Une erreur est survenue.');
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
