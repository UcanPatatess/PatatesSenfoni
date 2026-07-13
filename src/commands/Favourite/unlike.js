const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
  ComponentType,
  ContainerBuilder,
  TextDisplayBuilder,
  SeparatorBuilder,
  MessageFlags
} = require("discord.js");

function formatDuration(ms) {
  if (!ms || ms === 0 || ms === 'Unknown') return 'Unknown';
  if (typeof ms === 'string' && ms.includes(':')) return ms;

  const duration = parseInt(ms);
  if (isNaN(duration)) return 'Unknown';

  const seconds = Math.floor((duration / 1000) % 60);
  const minutes = Math.floor((duration / (1000 * 60)) % 60);
  const hours = Math.floor(duration / (1000 * 60 * 60));

  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  }
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

module.exports = {
  name: "unlike",
  category: "Favourite",
  description: "Favorilerinden şarkıları kaldır",
  args: false,
  usage: "",
  aliases: ["delfav", "removefav", "unliked", "deleteliked"],
  userPerms: [],
  owner: false,
  player: false,
  inVoiceChannel: false,
  sameVoiceChannel: false,
  slashOptions: [],

  async slashExecute(interaction, client) {
    const interactionWrapper = {
      guild: interaction.guild,
      channel: interaction.channel,
      author: interaction.user,
      member: interaction.member,
      createdTimestamp: interaction.createdTimestamp,
      reply: async (options) => {
        if (interaction.deferred) {
          return await interaction.editReply(options);
        } else if (interaction.replied) {
          return await interaction.followUp(options);
        } else {
          return await interaction.reply(options);
        }
      },
    };

    const args = [];
    if (interaction.options) {
      const options = interaction.options.data;
      for (const option of options) {
        if (option.value !== undefined) {
          args.push(option.value.toString());
        }
      }
    }

    const prefix = client.prefix;
    return this.execute(interactionWrapper, args, client, prefix);
  },

  async execute(message, args, client, prefix) {
    const userId = message.author.id;

    try {
      const favorites = client.db.liked.get(userId);

      if (!favorites || !favorites.length) {
        const infoDisplay = new TextDisplayBuilder()
          .setContent(`**${client.emoji.info} Favorilerinde kayıtlı şarkı yok!**`);

        const container = new ContainerBuilder()
          .addTextDisplayComponents(infoDisplay);

        return message.reply({
          components: [container],
          flags: MessageFlags.IsComponentsV2
        });
      }

      const songsPerPage = 10;
      let totalPages = Math.ceil(favorites.length / songsPerPage);
      let currentPage = 0;

      const generateContainer = (page, currentFavorites) => {
        const start = page * songsPerPage;
        const end = Math.min(start + songsPerPage, currentFavorites.length);
        const pageTracks = currentFavorites.slice(start, end);

        const headerDisplay = new TextDisplayBuilder()
          .setContent(`**${client.emoji.info} Favorilerini Yönet**`);

        const separator1 = new SeparatorBuilder();

        const infoDisplay = new TextDisplayBuilder()
          .setContent(
            `**Favoriler:** \`${currentFavorites.length} şarkı\`\n` +
            `**Sayfa:** \`${page + 1} / ${Math.ceil(currentFavorites.length / songsPerPage)}\``
          );

        const separator2 = new SeparatorBuilder();

        const tracksText = pageTracks.map((track, i) => {
          const position = start + i;
          const duration = track.duration || track.length;
          return `**\`${position}\` | ${track.title} - \`${formatDuration(duration)}\`**`;
        }).join('\n');

        const tracksDisplay = new TextDisplayBuilder()
          .setContent(tracksText);

        return new ContainerBuilder()
          .addTextDisplayComponents(headerDisplay)
          .addSeparatorComponents(separator1)
          .addTextDisplayComponents(infoDisplay)
          .addSeparatorComponents(separator2)
          .addTextDisplayComponents(tracksDisplay);
      };

      const generateSelectMenu = (page, currentFavorites) => {
        const start = page * songsPerPage;
        const end = Math.min(start + songsPerPage, currentFavorites.length);
        const pageTracks = currentFavorites.slice(start, end);

        const options = pageTracks.map((track, i) => {
          const position = start + i;
          return {
            label: `${position}. ${track.title.substring(0, 90)}`,
            description: `Süre: ${formatDuration(track.duration || track.length)}`,
            value: `unlike_${position}`
          };
        });

        return new ActionRowBuilder().addComponents(
          new StringSelectMenuBuilder()
            .setCustomId('select_favorite')
            .setPlaceholder('Kaldırmak istediğin şarkıları seç')
            .setMinValues(1)
            .setMaxValues(Math.min(options.length, 10))
            .addOptions(options)
        );
      };

      const generateButtons = (page, currentFavorites) => {
        const currentTotalPages = Math.ceil(currentFavorites.length / songsPerPage);
        return new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId('clear_favorites')
            .setLabel('Tümünü Temizle')
            .setStyle(ButtonStyle.Danger),
          new ButtonBuilder()
            .setCustomId('previous')
            .setLabel('Önceki')
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(currentTotalPages <= 1),
          new ButtonBuilder()
            .setCustomId('next')
            .setLabel('Sonraki')
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(currentTotalPages <= 1),
          new ButtonBuilder()
            .setCustomId('close_session')
            .setLabel('Kapat')
            .setStyle(ButtonStyle.Secondary)
        );
      };

      const components = [
        generateContainer(currentPage, favorites),
        generateSelectMenu(currentPage, favorites),
        generateButtons(currentPage, favorites)
      ];

      const msg = await message.reply({
        components,
        flags: MessageFlags.IsComponentsV2
      });

      const collector = msg.createMessageComponentCollector({
        filter: (i) => {
          if (i.user.id === message.author.id) return true;

          const errorDisplay = new TextDisplayBuilder()
            .setContent(`**${client.emoji.cross} Sadece ${message.author.tag} bu işlemi gerçekleştirebilir!**`);

          const errorContainer = new ContainerBuilder()
            .addTextDisplayComponents(errorDisplay);

          i.reply({
            components: [errorContainer],
            flags: MessageFlags.Ephemeral | MessageFlags.IsComponentsV2
          });
          return false;
        },
        idle: 60000
      });

      collector.on('collect', async (interaction) => {
        let currentFavs = client.db.liked.get(userId);

        if (!currentFavs || (interaction.customId !== 'clear_favorites' && currentFavs.length === 0)) {
          const errorDisplay = new TextDisplayBuilder()
            .setContent(`**${client.emoji.info} Favorilerinde kayıtlı şarkı yok!**`);
          const errorContainer = new ContainerBuilder().addTextDisplayComponents(errorDisplay);
          await interaction.reply({ components: [errorContainer], flags: MessageFlags.Ephemeral | MessageFlags.IsComponentsV2 });
          collector.stop();
          return;
        }

        if (interaction.customId === 'select_favorite') {
          await interaction.deferUpdate();

          const selectedValues = interaction.values;
          const positions = selectedValues.map(v => parseInt(v.split('_')[1])).sort((a, b) => b - a);

          const removedTracks = [];
          for (const pos of positions) {
            const track = currentFavs[pos];
            if (track) {
              removedTracks.push(track.title);
              currentFavs.splice(pos, 1);
            }
          }

          client.db.liked.set(userId, currentFavs);

          const newTotalPages = Math.ceil(currentFavs.length / songsPerPage);
          if (currentPage >= newTotalPages && newTotalPages > 0) {
            currentPage = newTotalPages - 1;
          }

          if (currentFavs.length === 0) {
            const emptyDisplay = new TextDisplayBuilder()
              .setContent(`**${client.emoji.check} ${removedTracks.length} şarkı favorilerinden kaldırıldı. Favori listen artık boş!**`);
            const emptyContainer = new ContainerBuilder().addTextDisplayComponents(emptyDisplay);
            await msg.edit({ components: [emptyContainer], flags: MessageFlags.IsComponentsV2 });
            collector.stop();
          } else {
            const successDisplay = new TextDisplayBuilder()
              .setContent(`**${client.emoji.check} ${removedTracks.length} şarkı favorilerinden kaldırıldı.**`);
            const successContainer = new ContainerBuilder().addTextDisplayComponents(successDisplay);

            await msg.edit({
              components: [
                successContainer,
                generateContainer(currentPage, currentFavs),
                generateSelectMenu(currentPage, currentFavs),
                generateButtons(currentPage, currentFavs)
              ],
              flags: MessageFlags.IsComponentsV2
            });
          }
        } else if (interaction.customId === 'previous') {
          await interaction.deferUpdate();
          const totalPagesNow = Math.ceil(currentFavs.length / songsPerPage);
          currentPage = currentPage > 0 ? currentPage - 1 : totalPagesNow - 1;

          await msg.edit({
            components: [
              generateContainer(currentPage, currentFavs),
              generateSelectMenu(currentPage, currentFavs),
              generateButtons(currentPage, currentFavs)
            ],
            flags: MessageFlags.IsComponentsV2
          });
        } else if (interaction.customId === 'next') {
          await interaction.deferUpdate();
          const totalPagesNow = Math.ceil(currentFavs.length / songsPerPage);
          currentPage = currentPage < totalPagesNow - 1 ? currentPage + 1 : 0;

          await msg.edit({
            components: [
              generateContainer(currentPage, currentFavs),
              generateSelectMenu(currentPage, currentFavs),
              generateButtons(currentPage, currentFavs)
            ],
            flags: MessageFlags.IsComponentsV2
          });
        } else if (interaction.customId === 'clear_favorites') {
          await interaction.deferUpdate();

          const favCount = currentFavs.length;
          client.db.liked.set(userId, []);

          const successDisplay = new TextDisplayBuilder()
            .setContent(`**${client.emoji.check} Tüm ${favCount} favorilerin temizlendi.**`);

          const successContainer = new ContainerBuilder()
            .addTextDisplayComponents(successDisplay);

          await msg.edit({
            components: [successContainer],
            flags: MessageFlags.IsComponentsV2
          });

          collector.stop();
        } else if (interaction.customId === 'close_session') {
          await interaction.deferUpdate();
          collector.stop('manual');
          await msg.delete().catch(() => { });
        }
      });

      collector.on('end', async (collected, reason) => {
        if (reason === 'idle' || reason === 'time') {
          const timeoutDisplay = new TextDisplayBuilder()
            .setContent(`**${client.emoji.info} Oturum süresi doldu. Komutu tekrar kullanın.**`);
          const timeoutContainer = new ContainerBuilder().addTextDisplayComponents(timeoutDisplay);

          await msg.edit({
            components: [timeoutContainer],
            flags: MessageFlags.IsComponentsV2
          }).catch(() => { });
        }
      });

    } catch (err) {
      console.error(err);

      const errorDisplay = new TextDisplayBuilder()
        .setContent(`**${client.emoji.cross} Favorilerden kaldırma sırasında bir hata oluştu.**`);

      const container = new ContainerBuilder()
        .addTextDisplayComponents(errorDisplay);

      return message.reply({
        components: [container],
        flags: MessageFlags.IsComponentsV2
      });
    }
  }
};
