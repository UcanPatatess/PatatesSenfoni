const {
  PermissionsBitField,
  WebhookClient,
  EmbedBuilder,
  ContainerBuilder,
  TextDisplayBuilder,
  SeparatorBuilder,
  MessageFlags
} = require("discord.js");
const cooldowns = new Map();

module.exports = {
  name: "messageCreate",
  once: false,
  run: async (client, message) => {
    if (message.author.bot || !message.guild) return;

    try {
      if (client.automod) client.automod.handleMessage(message);
    } catch (err) {
      console.error(`[AutoMod Error] ${err.message}`);
    }

    const isIgnored = client.db.ignorechannels.get(message.guild.id, message.channel.id);
    if (isIgnored) {
      return;
    }



    let prefix = client.prefix;
    const prefixData = client.db.prefixes.get(message.guild.id);
    if (prefixData?.prefix) prefix = prefixData.prefix;

    const mention = new RegExp(`^<@!?${client.user.id}>( |)$`);
    if (message.content.match(mention)) {
      const perms = message.channel.permissionsFor(client.user);
      if (!perms || !perms.has(PermissionsBitField.Flags.SendMessages) || !perms.has(PermissionsBitField.Flags.EmbedLinks)) {
        return;
      }

      const greetDisplay = new TextDisplayBuilder()
        .setContent(
          `**${client.emoji.check} Merhaba ${message.author}!**\n` +
          `**${client.emoji.info} Bu sunucudaki önekim  **\`${prefix}\`\n\n` +
          `**${client.emoji.info} Komut listesi için \`${prefix}help\` yaz.**`
        );

      const container = new ContainerBuilder()
        .addTextDisplayComponents(greetDisplay);

      await message.channel.send({
        components: [container],
        flags: MessageFlags.IsComponentsV2
      }).catch(() => null);
      return;
    }

    const hasNoPrefix = client.db.noprefix.getGlobal(message.author.id);

    let usedPrefix = '';
    if (message.content.startsWith(prefix)) {
      usedPrefix = prefix;
    } else if (message.content.match(new RegExp(`^<@!?${client.user.id}>`))) {
      usedPrefix = message.content.match(new RegExp(`^<@!?${client.user.id}>`))[0];
    } else if (!hasNoPrefix) {
      return;
    }

    const args = message.content.slice(usedPrefix.length).trim().split(/ +/);
    const commandName = args.shift()?.toLowerCase();
    if (!commandName) return;

    const command = client.commands.get(commandName)
      || client.commands.find(cmd => Array.isArray(cmd.aliases) ? cmd.aliases.includes(commandName) : cmd.aliases === commandName);

    if (!command) return;

    if (usedPrefix.length === 0 && commandName === 'i' && command.name === 'invites') {
      if (args.length > 1 || (args.length === 1 && !/^(<@!?\d+>|\d+)$/.test(args[0]))) {
        return;
      }
    }

    const isBlacklisted = client.db.blacklist.get(message.author.id);
    if (isBlacklisted) {
      const blacklistDisplay = new TextDisplayBuilder()
        .setContent(`**${client.emoji.warn} Botu kullanman engellendi!**`);

      const container = new ContainerBuilder()
        .addTextDisplayComponents(blacklistDisplay);

      const reply = await message.channel.send({
        components: [container],
        flags: MessageFlags.IsComponentsV2
      }).catch(() => null);
      if (reply) setTimeout(() => reply.delete().catch(() => { }), 5000);
      return;
    }

    if (!cooldowns.has(command.name)) {
      cooldowns.set(command.name, new Map());
    }

    const now = Date.now();
    const timestamps = cooldowns.get(command.name);
    const cooldownAmount = (command.cooldown || 3) * 1000;

    if (timestamps.has(message.author.id)) {
      const expirationTime = timestamps.get(message.author.id) + cooldownAmount;

      if (now < expirationTime) {
        const timeLeft = ((expirationTime - now) / 1000).toFixed(1);

        const cooldownDisplay = new TextDisplayBuilder()
          .setContent(`**${client.emoji.warn} \`${command.name}\` komutunu tekrar kullanmadan önce ${timeLeft}s bekle.**`);

        const container = new ContainerBuilder()
          .addTextDisplayComponents(cooldownDisplay);

        return message.reply({
          components: [container],
          flags: MessageFlags.IsComponentsV2
        }).then((msg) => {
          const delayTime = expirationTime - now;
          setTimeout(() => {
            msg.delete().catch(() => { });
          }, delayTime);
        });
      }
    }
    timestamps.set(message.author.id, now);
    setTimeout(() => timestamps.delete(message.author.id), cooldownAmount);

    const perms = message.channel.permissionsFor(client.user);
    if (!perms || !perms.has(PermissionsBitField.Flags.SendMessages)) {
      const errorDisplay = new TextDisplayBuilder()
        .setContent(`**${client.emoji.cross} Bu kanalda \`${command.name}\` komutunu çalıştırmak için \`SEND_MESSAGES\` yetkim yok.**`);

      const container = new ContainerBuilder()
        .addTextDisplayComponents(errorDisplay);

      return await message.author.send({
        components: [container],
        flags: MessageFlags.IsComponentsV2
      }).catch(() => { });
    }

    if (!perms.has(PermissionsBitField.Flags.EmbedLinks)) {
      const errorDisplay = new TextDisplayBuilder()
        .setContent(`**${client.emoji.cross} Bu kanalda \`${command.name}\` komutunu çalıştırmak için \`EMBED_LINKS\` yetkim yok.**`);

      const container = new ContainerBuilder()
        .addTextDisplayComponents(errorDisplay);

      return await message.channel.send({
        components: [container],
        flags: MessageFlags.IsComponentsV2
      }).catch(() => { });
    }

    if (command.args && !args.length) {
      let reply = `${message.author}, hiçbir argüman girmedin!`;
      if (command.usage) {
        reply += `\nKullanım: \`${prefix}${command.name} ${command.usage}\``;
      }

      const argsDisplay = new TextDisplayBuilder()
        .setContent(reply);

      const container = new ContainerBuilder()
        .addTextDisplayComponents(argsDisplay);

      return message.channel.send({
        components: [container],
        flags: MessageFlags.IsComponentsV2
      }).catch(() => null);
    }

    if (command.botPerms && !message.guild.members.me.permissions.has(PermissionsBitField.resolve(command.botPerms || []))) {
      const permDisplay = new TextDisplayBuilder()
        .setContent(`Bu komutu çalıştırmak için **\`${command.botPerms.join(', ')}\`** yetkisine ihtiyacım var.`);

      const container = new ContainerBuilder()
        .addTextDisplayComponents(permDisplay);

      return message.channel.send({
        components: [container],
        flags: MessageFlags.IsComponentsV2
      }).catch(() => null);
    }

    if (command.userPerms && !client.config.ownerID.includes(message.author.id) && !message.member.permissions.has(PermissionsBitField.resolve(command.userPerms || []))) {
      const permDisplay = new TextDisplayBuilder()
        .setContent(`Bu komutu kullanmak için **\`${command.userPerms.join(', ')}\`** yetkisine sahip olman gerekiyor.`);

      const container = new ContainerBuilder()
        .addTextDisplayComponents(permDisplay);

      return message.channel.send({
        components: [container],
        flags: MessageFlags.IsComponentsV2
      }).catch(() => null);
    }

    const { checkBotRank } = require("../../utils/permissionCheck");
    if (command.rank) {
      const hasRank = await checkBotRank(message.author.id, command.rank, client, command.name);
      if (!hasRank) return;
    } else if (command.owner && !client.config.ownerID.includes(message.author.id)) {
      return;
    }

    const player = client.manager.players.get(message.guild.id);
    if (command.player && !player) {
      const playerDisplay = new TextDisplayBuilder()
        .setContent(`**${client.emoji.warn} Bu sunucuda aktif bir müzik oynatıcı yok.**`);

      const container = new ContainerBuilder()
        .addTextDisplayComponents(playerDisplay);

      return message.channel.send({
        components: [container],
        flags: MessageFlags.IsComponentsV2
      }).catch(() => null);
    }

    if (command.inVoiceChannel && !message.member.voice.channel) {
      const vcDisplay = new TextDisplayBuilder()
        .setContent(`**${client.emoji.warn} Bu komutu kullanmak için bir ses kanalında olmalısın.**`);

      const container = new ContainerBuilder()
        .addTextDisplayComponents(vcDisplay);

      return message.channel.send({
        components: [container],
        flags: MessageFlags.IsComponentsV2
      }).catch(() => null);
    }

    if (command.sameVoiceChannel && player && message.member.voice.channel.id !== player.voiceId) {
      const sameVcDisplay = new TextDisplayBuilder()
        .setContent(`**${client.emoji.warn} Benimle aynı ses kanalında olmalısın.**`);

      const container = new ContainerBuilder()
        .addTextDisplayComponents(sameVcDisplay);

      return message.channel.send({
        components: [container],
        flags: MessageFlags.IsComponentsV2
      }).catch(() => null);
    }

    try {
      await command.execute(message, args, client, prefix);

      if (client.config.Webhooks?.cmdrun) {
        const web = new WebhookClient({ url: client.config.Webhooks.cmdrun });

        const commandlog = new EmbedBuilder()
          .setAuthor({ name: message.author.tag, iconURL: message.author.displayAvatarURL({ dynamic: true }) })
          .setColor(client.color)
          .setThumbnail(message.author.displayAvatarURL({ dynamic: true }))
          .setTimestamp()
          .setDescription(
            `**${client.emoji.dot} Komut Kullanılan Sunucu:** \`${message.guild.name} | ${message.guild.id}\`\n` +
            `**${client.emoji.dot} Kanal:** \`${message.channel.name} | ${message.channel.id}\`\n` +
            `**${client.emoji.dot} Komut:** \`${command.name}\`\n` +
            `**${client.emoji.dot} Yürütücü:** \`${message.author.tag} | ${message.author.id}\`\n` +
            `**${client.emoji.dot} İçerik:** \`${message.content}\``
          );

        web.send({ embeds: [commandlog] }).catch(console.error);
      }
    } catch (error) {
      console.error(`Error executing command ${command.name}:`, error);

      const errorDisplay = new TextDisplayBuilder()
        .setContent(`**${client.emoji.warn} Bu komut çalıştırılırken bir hata oluştu!**`);

      const container = new ContainerBuilder()
        .addTextDisplayComponents(errorDisplay);

      try {
        const perms = message.channel.permissionsFor(client.user);
        if (perms && perms.has(PermissionsBitField.Flags.SendMessages)) {
          if (perms.has(PermissionsBitField.Flags.EmbedLinks)) {
            await message.channel.send({
              components: [container],
              flags: MessageFlags.IsComponentsV2
            });
          } else {
            await message.channel.send({
              content: `**${client.emoji.warn} Bu komut çalıştırılırken bir hata oluştu!**`
            });
          }
        }
      } catch (sendError) {
        if (sendError.code !== 50013) {
          console.error(`Failed to send error message:`, sendError);
        }
      }
    }
  },
};
