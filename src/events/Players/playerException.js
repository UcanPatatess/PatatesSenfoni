const {
  ContainerBuilder,
  TextDisplayBuilder,
  MessageFlags
} = require("discord.js");

module.exports = {
  name: "playerException",
  run: async (client, player, reason) => {
    try {
      client.logger.log(
        `Player Exception: ${JSON.stringify(reason)}`,
        "error"
      );

      const guild = client.guilds.cache.get(player.guildId);
      if (!guild) return;
      const channel = client.channels.cache.get(player.textId);
      const currentTrack = player.queue.current;

      if (reason.exception?.cause?.includes("ScriptExtractionException")) {
        if (currentTrack) {
          const searchQuery = `${currentTrack.title} ${currentTrack.author}`;
          let searchResult = await client.manager.search(searchQuery, {
            engine: "ytmsearch",
            requester: currentTrack.requester,
          });

          if (!searchResult.tracks.length) {
            searchResult = await client.manager.search(searchQuery, {
              engine: "spsearch",
              requester: currentTrack.requester,
            });
          }

          if (!searchResult.tracks.length) {
            searchResult = await client.manager.search(searchQuery, {
              engine: "scsearch",
              requester: currentTrack.requester,
            });
          }

          if (searchResult.tracks.length > 0) {
            if (channel) {
              const fallbackDisplay = new TextDisplayBuilder()
                .setContent(`**${client.emoji.warn} YouTube engellendi → alternatif kaynak kullanılıyor!**`);

              const container = new ContainerBuilder()
                .addTextDisplayComponents(fallbackDisplay);

              channel
                .send({
                  components: [container],
                  flags: MessageFlags.IsComponentsV2
                })
                .catch(() => null);
            }

            player.queue.unshift(searchResult.tracks[0]);
            player.skip();
            return;
          }
        }

        if (channel) {
          const blockedDisplay = new TextDisplayBuilder()
            .setContent(
              `**${client.emoji.error} Bu parça çalınamadı [YouTube engellendi].**\n` +
              `**${client.emoji.info} Geçiliyor...**`
            );

          const container = new ContainerBuilder()
            .addTextDisplayComponents(blockedDisplay);

          channel
            .send({
              components: [container],
              flags: MessageFlags.IsComponentsV2
            })
            .catch(() => null);
        }

        if (player.queue.length > 0) {
          player.skip();
        }
        return;
      }

      if (player && !player.destroyed) {
        if (channel) {
          const errorDisplay = new TextDisplayBuilder()
            .setContent(
              `**${client.emoji.warn} Oynatma hatası oluştu.**\n` +
              `**${client.emoji.info} Parçaya geçiliyor...**`
            );

          const container = new ContainerBuilder()
            .addTextDisplayComponents(errorDisplay);

          channel
            .send({
              components: [container],
              flags: MessageFlags.IsComponentsV2
            })
            .catch(() => null);
        }

        if (player.queue.length > 0) {
          player.skip();
        } else {
          try {
            await player.destroy();
          } catch (e) {
            if (client.manager.players.has(player.guildId)) {
              client.manager.players.delete(player.guildId);
            }
            if (client.manager.shoukaku) {
              client.manager.shoukaku.leaveVoiceChannel(player.guildId).catch(() => null);
            }
          }
        }
      }
    } catch (err) {
      client.logger.log(
        `Error handling player exception: ${err.message}`,
        "error"
      );
    }
  },
};
