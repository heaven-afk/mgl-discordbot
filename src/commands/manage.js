const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } = require('discord.js');
const permissionService = require('../services/permissionService');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('manage')
        .setDescription('Manage tiered command permissions')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
        // Subcommand: Add Role
        .addSubcommand(sub =>
            sub.setName('add_role')
                .setDescription('Assign a role to a permission tier')
                .addRoleOption(opt => opt.setName('role').setDescription('The role to add').setRequired(true))
                .addIntegerOption(opt =>
                    opt.setName('tier')
                        .setDescription('The tier to assign (1-3)')
                        .setRequired(true)
                        .addChoices(
                            { name: 'Tier 1 (Light)', value: 1 },
                            { name: 'Tier 2 (Mid)', value: 2 },
                            { name: 'Tier 3 (High)', value: 3 }
                        )
                )
        )
        // Subcommand: Remove Role
        .addSubcommand(sub =>
            sub.setName('remove_role')
                .setDescription('Remove a role from a permission tier')
                .addRoleOption(opt => opt.setName('role').setDescription('The role to remove').setRequired(true))
                .addIntegerOption(opt =>
                    opt.setName('tier')
                        .setDescription('The tier to remove from (1-3)')
                        .setRequired(true)
                        .addChoices(
                            { name: 'Tier 1', value: 1 },
                            { name: 'Tier 2', value: 2 },
                            { name: 'Tier 3', value: 3 }
                        )
                )
        )
        // Subcommand: Add User
        .addSubcommand(sub =>
            sub.setName('add_user')
                .setDescription('Assign a user to a permission tier')
                .addUserOption(opt => opt.setName('user').setDescription('The user to add').setRequired(true))
                .addIntegerOption(opt =>
                    opt.setName('tier')
                        .setDescription('The tier to assign (1-3)')
                        .setRequired(true)
                        .addChoices(
                            { name: 'Tier 1', value: 1 },
                            { name: 'Tier 2', value: 2 },
                            { name: 'Tier 3', value: 3 }
                        )
                )
        )
        // Subcommand: Remove User
        .addSubcommand(sub =>
            sub.setName('remove_user')
                .setDescription('Remove a user from a permission tier')
                .addUserOption(opt => opt.setName('user').setDescription('The user to remove').setRequired(true))
                .addIntegerOption(opt =>
                    opt.setName('tier')
                        .setDescription('The tier to remove from (1-3)')
                        .setRequired(true)
                        .addChoices(
                            { name: 'Tier 1', value: 1 },
                            { name: 'Tier 2', value: 2 },
                            { name: 'Tier 3', value: 3 }
                        )
                )
        )
        // Subcommand: List
        .addSubcommand(sub =>
            sub.setName('list')
                .setDescription('List all tiered permissions')
        ),

    async execute(interaction) {
        const sub = interaction.options.getSubcommand();

        if (sub === 'list') {
            return this.handleList(interaction);
        }

        const tier = interaction.options.getInteger('tier');
        let type, id, name;

        if (sub.includes('role')) {
            type = 'roles';
            const role = interaction.options.getRole('role');
            id = role.id;
            name = role.name;
        } else {
            type = 'users';
            const user = interaction.options.getUser('user');
            id = user.id;
            name = user.username;
        }

        const action = sub.startsWith('add');
        const success = permissionService.updateAccess(type, id, tier, action);

        if (success) {
            await interaction.reply({
                content: `✅ Successfully ${action ? 'added' : 'removed'} ${type === 'roles' ? 'role' : 'user'} **${name}** ${action ? 'to' : 'from'} **Tier ${tier}**.`,
                ephemeral: true
            });
        } else {
            await interaction.reply({
                content: `❌ Failed to update permissions.`,
                ephemeral: true
            });
        }
    },

    async handleList(interaction) {
        const config = permissionService.getAll();

        const embed = new EmbedBuilder()
            .setTitle('🔐 Tiered Permission Access')
            .setColor('#5865F2')
            .setTimestamp();

        for (let tier = 1; tier <= 3; tier++) {
            const key = `tier${tier}`;
            const roles = config.roles[key].map(id => `<@&${id}>`).join(', ') || 'None';
            const users = config.users[key].map(id => `<@${id}>`).join(', ') || 'None';

            let tierName = 'Light Access';
            if (tier === 2) tierName = 'Mid Access';
            if (tier === 3) tierName = 'High Access';

            embed.addFields({
                name: `Tier ${tier} — ${tierName}`,
                value: `**Roles:** ${roles}\n**Users:** ${users}`,
                inline: false
            });
        }

        await interaction.reply({ embeds: [embed], ephemeral: true });
    }
};
