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

(async () => {
  try {
    console.log(`Déploiement de ${commands.length} commande(s)…`);

    await rest.put(
      Routes.applicationGuildCommands(
        process.env.CLIENT_ID,
        process.env.GUILD_ID,
      ),
      { body: commands },
    );

    console.log('Commandes déployées avec succès !');
  } catch (err) {
    console.error('Erreur lors du déploiement :', err);
  }
})();
