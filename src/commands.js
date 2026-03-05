const { EmbedBuilder } = require('discord.js');
const { getLeaderboard, getTopInviter, getUserInvites } = require('./db');

const MEDALS = ['🥇', '🥈', '🥉'];

function formatRank(index) {
  return MEDALS[index] ?? `**${index + 1}.**`;
}

async function handleLeaderboard(interaction) {
  const limit = Math.min(25, Math.max(1, interaction.options.getInteger('limit') ?? 10));
  const guildId = interaction.guildId;

  const rows = getLeaderboard(guildId, limit);

  if (!rows.length) {
    return interaction.reply('Aucune donnée d\'invites pour le moment.');
  }

  const lines = rows.map((r, i) =>
    `${formatRank(i)} <@${r.userId}> — total **${r.total}**, actifs **${r.active}**`
  );

  const embed = new EmbedBuilder()
    .setTitle(`🏆 Top ${rows.length} inviters`)
    .setDescription(lines.join('\n'))
    .setColor(0xF1C40F)
    .setTimestamp();

  return interaction.reply({ embeds: [embed] });
}

async function handleTopInviter(interaction) {
  const guildId = interaction.guildId;
  const top = getTopInviter(guildId);

  if (!top) {
    return interaction.reply('Aucune donnée d\'invites pour le moment.');
  }

  const embed = new EmbedBuilder()
    .setTitle('👑 Meilleur inviter')
    .setDescription(
      `🥇 <@${top.userId}> — total **${top.total}**, actifs **${top.active}**`
    )
    .setColor(0xE67E22)
    .setTimestamp();

  return interaction.reply({ embeds: [embed] });
}

async function handleInvites(interaction) {
  const guildId = interaction.guildId;
  const userId = interaction.user.id;
  const data = getUserInvites(guildId, userId);

  if (!data) {
    return interaction.reply({
      content: 'Tu n\'as encore aucune invitation enregistrée.',
      ephemeral: true,
    });
  }

  const embed = new EmbedBuilder()
    .setTitle('📩 Tes invitations')
    .setDescription(
      `Total : **${data.total}**\nActifs : **${data.active}**`
    )
    .setColor(0x3498DB)
    .setTimestamp();

  return interaction.reply({ embeds: [embed], ephemeral: true });
}

module.exports = { handleLeaderboard, handleTopInviter, handleInvites };
