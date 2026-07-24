const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const messageMover = require('../services/messageMover');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('move')
        .setDescription('Transfer messages or forum posts between channels')
        .addChannelOption(option =>
            option.setName('source')
                .setDescription('Source text channel, thread, or forum channel')
                .setRequired(true))
        .addChannelOption(option =>
            option.setName('destination')
                .setDescription('Destination text channel, thread, or forum channel')
                .setRequired(true))
        .addIntegerOption(option =>
            option.setName('limit')
                .setDescription('Number of messages or forum posts to move (1-100)')
                .setMinValue(1)
                .setMaxValue(100)
                .setRequired(true))
        .addStringOption(option =>
            option.setName('after_message_id')
                .setDescription('Start moving messages/posts after this ID'))
        .addBooleanOption(option =>
            option.setName('include_bots')
                .setDescription('Include bot messages/posts?'))
        .addBooleanOption(option =>
            option.setName('delete_original')
                .setDescription('Delete original messages/posts? (Requires Manage Messages)'))
        .addBooleanOption(option =>
            option.setName('keep_author_context')
                .setDescription('Add "Originally sent by" header? (Default: true)')),

    async execute(interaction) {
        await interaction.deferReply({ ephemeral: true });

        const source = interaction.options.getChannel('source');
        const destination = interaction.options.getChannel('destination');
        const limit = interaction.options.getInteger('limit');
        const afterId = interaction.options.getString('after_message_id');
        const includeBots = interaction.options.getBoolean('include_bots') ?? false;
        const deleteOriginal = interaction.options.getBoolean('delete_original') ?? false;
        const keepAuthorContext = interaction.options.getBoolean('keep_author_context') ?? true;

        if (source.id === destination.id) {
            return interaction.editReply('Source and destination cannot be the same.');
        }

        // Permission Check
        if (!interaction.member.permissions.has(PermissionFlagsBits.ManageMessages)) {
            return interaction.editReply('You need `Manage Messages` permission to use this command.');
        }

        const isSourceForum = messageMover.isForumChannel(source);
        const isDestForum = messageMover.isForumChannel(destination);

        const isSourceText = source.isTextBased();
        const isDestText = destination.isTextBased();

        if (!isSourceText && !isSourceForum) {
            return interaction.editReply('Source must be a text channel, thread, or forum channel.');
        }
        if (!isDestText && !isDestForum) {
            return interaction.editReply('Destination must be a text channel, thread, or forum channel.');
        }

        try {
            // Case 1: Forum Channel -> Forum Channel
            if (isSourceForum && isDestForum) {
                const posts = await messageMover.fetchForumPosts(source, limit, afterId);
                if (posts.length === 0) {
                    return interaction.editReply('No forum posts found to move.');
                }

                await interaction.editReply(`Found ${posts.length} forum posts. Starting transfer...`);
                const movedCount = await messageMover.moveForumPosts({
                    sourceForum: source,
                    destinationForum: destination,
                    posts,
                    includeBots,
                    deleteOriginal,
                    keepAuthorContext
                }, interaction);

                return interaction.editReply(`Successfully moved ${movedCount} forum posts from ${source} to ${destination}.`);
            }

            // Case 2: Forum Channel -> Text Channel/Thread
            if (isSourceForum && isDestText) {
                const posts = await messageMover.fetchForumPosts(source, limit, afterId);
                if (posts.length === 0) {
                    return interaction.editReply('No forum posts found to move.');
                }

                await interaction.editReply(`Found ${posts.length} forum posts. Starting transfer to ${destination}...`);
                const movedCount = await messageMover.moveForumToText({
                    sourceForum: source,
                    destinationText: destination,
                    posts,
                    includeBots,
                    deleteOriginal,
                    keepAuthorContext
                }, interaction);

                return interaction.editReply(`Successfully moved ${movedCount} messages from ${posts.length} forum posts to ${destination}.`);
            }

            // Case 3: Thread / Text Channel -> Forum Channel
            if (!isSourceForum && isDestForum) {
                if (source.isThread()) {
                    await interaction.editReply(`Moving thread **${source.name}** to ${destination}...`);
                    const movedCount = await messageMover.moveThreadToForum({
                        sourceThread: source,
                        destinationForum: destination,
                        includeBots,
                        deleteOriginal,
                        keepAuthorContext
                    }, interaction);

                    return interaction.editReply(`Successfully moved thread **${source.name}** into ${destination}.`);
                } else {
                    await interaction.editReply(`Moving messages from ${source} to a new post in ${destination}...`);
                    const movedCount = await messageMover.moveTextToForum({
                        sourceChannel: source,
                        destinationForum: destination,
                        limit,
                        afterId,
                        includeBots,
                        deleteOriginal,
                        keepAuthorContext
                    }, interaction);

                    return interaction.editReply(`Successfully moved ${movedCount} messages from ${source} into a new forum post in ${destination}.`);
                }
            }

            // Case 4: Text Channel / Thread -> Text Channel / Thread
            const messages = await messageMover.fetchMessages(source, limit, afterId);
            if (messages.length === 0) {
                return interaction.editReply('No messages found to move.');
            }

            await interaction.editReply(`Found ${messages.length} messages. Starting transfer...`);
            const movedCount = await messageMover.moveMessages({
                source,
                destination,
                messages,
                includeBots,
                deleteOriginal,
                keepAuthorContext
            }, interaction);

            return interaction.editReply(`Successfully moved ${movedCount} messages from ${source} to ${destination}.`);

        } catch (error) {
            console.error(error);
            await interaction.editReply('An error occurred during the transfer.');
        }
    },
};
