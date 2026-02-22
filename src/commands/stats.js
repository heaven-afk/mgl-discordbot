const { SlashCommandBuilder } = require('discord.js');
const statsService = require('../services/statsService');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('stats')
        .setDescription('Display server statistics and analytics')
        .addStringOption(option =>
            option.setName('type')
                .setDescription('Type of statistics to display')
                .setRequired(true)
                .addChoices(
                    { name: 'Overview', value: 'overview' },
                    { name: 'Channels', value: 'channels' },
                    { name: 'Members', value: 'members' },
                    { name: 'Activity', value: 'activity' }
                )),

    async execute(interaction) {
        await interaction.deferReply();

        const type = interaction.options.getString('type');
        const guild = interaction.guild;

        try {
            let embed;

            switch (type) {
                case 'overview':
                    embed = await statsService.getOverviewStats(guild);
                    break;
                case 'channels':
                    embed = await statsService.getChannelStats(guild);
                    break;
                case 'members':
                    embed = await statsService.getMemberStats(guild);
                    break;
                case 'activity':
                    embed = await statsService.getActivityStats(guild);
                    break;
                default:
                    return interaction.editReply('Invalid statistics type.');
            }

            await interaction.editReply({ embeds: [embed] });
        } catch (error) {
            console.error(error);
            await interaction.editReply('Failed to retrieve statistics.');
        }
    },
};
