/**
 * Lumière Patisserie Discord Bot
 * ---------------------------------
 * This script registers slash commands with Discord.
 * Run this ONCE after setting up your .env file:
 *   node deploy-commands.js
 */

require('dotenv').config({ quiet: true });
const { REST, Routes, SlashCommandBuilder } = require('discord.js');

// Validate environment variables
const requiredEnvVars = ['DISCORD_TOKEN', 'DISCORD_CLIENT_ID', 'DISCORD_GUILD_ID'];
for (const envVar of requiredEnvVars) {
  if (!process.env[envVar] || process.env[envVar].includes('PASTE_')) {
    console.error(`❌ Error: ${envVar} is not set in .env file`);
    process.exit(1);
  }
}

// Define slash commands
const commands = [
  new SlashCommandBuilder()
    .setName('preorder')
    .setDescription('Submit a customer preorder (opens a form)'),

  new SlashCommandBuilder()
    .setName('wholesale')
    .setDescription('Submit a wholesale order (opens a form)'),

  new SlashCommandBuilder()
    .setName('delete')
    .setDescription('Delete an order (shows list of active orders)'),
].map(cmd => cmd.toJSON());

// Register commands with Discord
const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);

(async () => {
  try {
    console.log('🔄 Registering slash commands...');
    
    await rest.put(
      Routes.applicationGuildCommands(
        process.env.DISCORD_CLIENT_ID,
        process.env.DISCORD_GUILD_ID
      ),
      { body: commands }
    );
    
    console.log('✅ Slash commands registered successfully!');
    console.log('   Commands: /preorder, /wholesale, /delete');
    console.log('');
    console.log('Next step: Run the bot with: node index.js');
  } catch (error) {
    console.error('❌ Failed to register commands:', error);
  }
})();
