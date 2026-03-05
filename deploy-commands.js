require('dotenv').config();
const { REST, Routes, SlashCommandBuilder } = require('discord.js');

const commands = [
  new SlashCommandBuilder()
    .setName('leaderboard')
    .setDescription('Affiche le classement des membres ayant le plus d\'invitations')
    .addIntegerOption(opt =>
      opt
        .setName('limit')
        .setDescription('Nombre de membres à afficher (1-25, défaut 10)')
        .setMinValue(1)
        .setMaxValue(25)
        .setRequired(false)
    ),

  new SlashCommandBuilder()
    .setName('topinviter')
    .setDescription('Affiche le membre ayant invité le plus de monde'),

  new SlashCommandBuilder()
    .setName('invites')
    .setDescription('Affiche tes statistiques d\'invitations personnelles'),
].map(cmd => cmd.toJSON());

const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);

const guildIds = process.env.GUILD_IDS.split(',').map(id => id.trim()).filter(Boolean);

(async () => {
  console.log(`Déploiement de ${commands.length} commande(s) sur ${guildIds.length} serveur(s)…`);

  for (const guildId of guildIds) {
    try {
      await rest.put(
        Routes.applicationGuildCommands(process.env.CLIENT_ID, guildId),
        { body: commands },
      );
      console.log(`✓ Serveur ${guildId} — OK`);
    } catch (err) {
      console.error(`✗ Serveur ${guildId} — Erreur:`, err.message);
    }
  }

  console.log('Déploiement terminé !');
})();
