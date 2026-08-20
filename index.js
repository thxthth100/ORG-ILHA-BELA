const {
  Client, GatewayIntentBits, Partials, EmbedBuilder,
  ActionRowBuilder, ButtonBuilder, ButtonStyle,
  StringSelectMenuBuilder, PermissionFlagsBits, ChannelType
} = require('discord.js');
const fs   = require('fs');
const https = require('https');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers,
  ],
  partials: [Partials.Channel, Partials.Message],
});

// ── CONFIG ─────────────────────────────────────────────────────────────
let config = {};
if (fs.existsSync('./config.json')) { try { config = JSON.parse(fs.readFileSync('./config.json','utf8')); } catch {} }
function saveConfig() { fs.writeFileSync('./config.json', JSON.stringify(config,null,2)); }

let filas  = {};
let canais = {};
if (fs.existsSync('./filas.json'))  { try { filas  = JSON.parse(fs.readFileSync('./filas.json', 'utf8')); } catch {} }
if (fs.existsSync('./canais.json')) { try { canais = JSON.parse(fs.readFileSync('./canais.json','utf8')); } catch {} }
function saveFilas()  { try { fs.writeFileSync('./filas.json',  JSON.stringify(filas, null,2)); } catch {} }
function saveCanais() { try { fs.writeFileSync('./canais.json', JSON.stringify(canais,null,2)); } catch {} }

// ── CONSTANTES ─────────────────────────────────────────────────────────
const ORG    = 'ORG BELA';
const GEL_IMG = 'https://i.imgur.com/placeholder.png'; // Troque pela URL do gel após !setthumb
const GEL_FILE = fs.existsSync('./gelo.png') ? './gelo.png' : './attached_assets/gelo.png';
const MODES   = { '1v1': 2, '2v2': 4, '3v3': 6, '4v4': 8 };
const PLATS   = ['mobile', 'emu', 'misto'];
const ALL_FILA_VALUES = [200, 100, 50, 20, 10, 5, 2, 1, 0.5];
const TICKET_TYPES = {
  suporte: { label:'Suporte', emoji:'🛠️', description:'Precisa de ajuda com o servidor ou com o bot?' },
  vaga_mediador: { label:'Vaga de Mediador', emoji:'⚖️', description:'Candidate-se para ser mediador.' },
  reembolso: { label:'Reembolso', emoji:'💸', description:'Solicite ajuda sobre um reembolso.' },
  vaga_suporte: { label:'Vaga de Suporte', emoji:'🛡️', description:'Candidate-se para a equipe de suporte.' },
  receber_evento: { label:'Receber Evento', emoji:'🎁', description:'Solicite ou receba um evento.' },
  parceria: { label:'Parceria', emoji:'🤝', description:'Fale sobre uma parceria.' },
};

function rnd(n) { return Math.floor(Math.random()*Math.pow(10,n)).toString().padStart(n,'0'); }
function fmtVal(v) { return 'R$ '+Number(v).toFixed(2).replace('.',','); }
function filaFiles() {
  // As imagens dos itens ficam nos emojis dos botões.
  // Não anexar a imagem na embed: a thumbnail deve ser a da organização.
  return [];
}

function buildTicketMenu() {
  return new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId('ticket_menu')
      .setPlaceholder('Selecione o tipo do atendimento')
      .addOptions(Object.entries(TICKET_TYPES).map(([value, item]) => ({
        label:item.label,
        value,
        emoji:item.emoji,
        description:item.description,
      })))
  );
}

async function garantirEmojisDaFila() {
  const guild = client.guilds.cache.first();
  if (!guild) return;

  const emojis = [
    { configKey:'umpEmojiId', name:'umpxm8', file:'./gelo.png' },
    { configKey:'gelEmojiId', name:'gelnormal', file:'./gel_normal.png' },
  ];

  for (const item of emojis) {
    try {
      let emoji = item.configKey === 'umpEmojiId'
        ? (config.umpEmojiId && guild.emojis.cache.get(config.umpEmojiId))
        : (config.gelEmojiId && guild.emojis.cache.get(config.gelEmojiId));

      if (!emoji) emoji = guild.emojis.cache.find(e => e.name === item.name);

      if (!emoji && fs.existsSync(item.file)) {
        emoji = await guild.emojis.create({ attachment:item.file, name:item.name });
        console.log(`✅ Emoji ${item.name} criado automaticamente.`);
      }

      if (emoji && config[item.configKey] !== emoji.id) {
        config[item.configKey] = emoji.id;
        saveConfig();
      }
    } catch (e) {
      console.error(`Não foi possível configurar o emoji ${item.name}:`, e.message);
    }
  }
}

// ── FILA HELPERS ───────────────────────────────────────────────────────
function getFilaKey(mode,plat,value) { return `${mode}_${plat}_${Number(value).toFixed(2)}`; }
function getFila(mode,plat,value) {
  const k = getFilaKey(mode,plat,value);
  if (!filas[k]) filas[k] = { normal:[], infinito:[] };
  return filas[k];
}

// ── EMBEDS ─────────────────────────────────────────────────────────────
function buildFilaEmbed(mode, plat, value) {
  const fila  = getFila(mode, plat, value);
  const maxP  = MODES[mode];
  const platLabel = plat==='mobile' ? 'MOBILE' : plat==='misto' ? 'MISTO' : 'EMULADOR';

  // Lista de todos os jogadores com gel
  const allPlayers = [
    ...fila.normal.map(p => `<@${p.id}> | Gel Normal`),
    ...fila.infinito.map(p => `<@${p.id}> | Full UMP XM8`),
  ];
  const jogadoresList = allPlayers.length > 0 ? allPlayers.join('\n') : '_Nenhum jogador ainda_';

  const embed = new EmbedBuilder()
    .setColor(plat==='mobile' ? 0x3498DB : 0x9B59B6)
    .setTitle(`${mode.toUpperCase()} ${platLabel}`)
    .addFields({ name:'👥 Jogadores', value:jogadoresList, inline:false })
    .setTimestamp();

  // A thumbnail da embed é somente a imagem da organização.
  if (config.thumbUrl) embed.setThumbnail(config.thumbUrl);
  return embed;
}

function buildFilaButtons(mode,plat,value) {
  const v = Number(value).toFixed(2);
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`fi_${mode}_${plat}_${v}`)
        .setLabel('Full UMP XM8')
        .setEmoji(config.umpEmojiId ? { id:config.umpEmojiId } : { name:'🔫' })
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId(`fn_${mode}_${plat}_${v}`)
        .setLabel('Gel Normal')
        .setEmoji(config.gelEmojiId ? { id:config.gelEmojiId } : { name:'🧊' })
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId(`fs_${mode}_${plat}_${v}`).setLabel('Sair da Fila').setStyle(ButtonStyle.Danger),
    )
  ];
}

function buildMediadorMenu(channelId) {
  return new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId(`med_${channelId}`)
      .setPlaceholder('⚖️ Menu do Mediador...')
      .addOptions([
        { label:'✅ Finalizar Aposta',   value:'finalizar', description:'Encerra a fila e deleta o canal', emoji:'✅' },
        { label:'🏆 Escolher Vencedor',  value:'vencedor',  description:'Escolhe quem ganhou',            emoji:'🏆' },
        { label:'⚠️ Vitória por W.O',    value:'wo',        description:'Vitória por walkover',           emoji:'⚠️' },
        { label:'💳 Liberar PIX',        value:'pix',       description:'Permite envio de mensagens',     emoji:'💳' },
      ])
  );
}

// Menu usado somente no canal fila-mediador.
// Entrar/sair de serviço não aparece no canal da aposta.
function buildFilaMediadorMenu(channelId) {
  return new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId(`med_${channelId}`)
      .setPlaceholder('⚖️ Menu do Mediador...')
      .addOptions([
        { label:'🟢 Entrar em Serviço',  value:'servico',   description:'Entrar como mediador desta fila', emoji:'🟢' },
        { label:'🔴 Sair de Serviço',    value:'sairserv',  description:'Sair do serviço de mediador',    emoji:'🔴' },
        { label:'✅ Finalizar Aposta',   value:'finalizar', description:'Encerra a fila e deleta o canal', emoji:'✅' },
        { label:'🏆 Escolher Vencedor',  value:'vencedor',  description:'Escolhe quem ganhou',            emoji:'🏆' },
        { label:'⚠️ Vitória por W.O',    value:'wo',        description:'Vitória por walkover',           emoji:'⚠️' },
        { label:'💳 Liberar PIX',        value:'pix',       description:'Permite envio de mensagens',     emoji:'💳' },
      ])
  );
}

// ── CRIAR CANAL ────────────────────────────────────────────────────────
async function criarCanalFila(guild, mode, plat, value, players, gelType) {
  const platLabel = plat==='mobile' ? 'MOBILE' : plat==='misto' ? 'MISTO' : 'EMULADOR';
  const channelName = `${platLabel}-${rnd(5)}`;

  let ch;
  try {
    ch = await guild.channels.create({
      name: channelName,
      type: ChannelType.GuildText,
      parent: config.filaCategory || null,
      permissionOverwrites: [
        { id:guild.id,       deny: [PermissionFlagsBits.ViewChannel] },
        { id:client.user.id, allow:[PermissionFlagsBits.ViewChannel,PermissionFlagsBits.SendMessages,PermissionFlagsBits.ManageChannels,PermissionFlagsBits.ManageRoles] },
        ...players.map(p=>({ id:p.id, allow:[PermissionFlagsBits.ViewChannel], deny:[PermissionFlagsBits.SendMessages] })),
        ...(config.staffRole ? [{ id:config.staffRole, allow:[PermissionFlagsBits.ViewChannel,PermissionFlagsBits.SendMessages] }] : []),
      ],
    });
  } catch(e) { console.error('Erro criar canal:', e); return; }

  canais[ch.id] = { mode, plat, value:Number(value), players, gelType, pixLiberado:false, mediador:null };
  saveCanais();

  const platLabel2 = plat==='mobile' ? '📱 Mobile' : plat==='misto' ? '🎮 Misto' : '🖥️ Emulador';
  const gelLabel   = gelType==='normal' ? '🧊 Gel Normal' : '🔫 Full UMP XM8';

  const embed = new EmbedBuilder()
    .setColor(0xFFAA00)
    .setTitle(`⚔️ ${channelName} | ${ORG}`)
    .setDescription(
      `> 🔇 Você **não pode enviar mensagens** até o mediador liberar o PIX!\n\n` +
      `**Modo:** ${mode.toUpperCase()} — ${platLabel2}\n` +
      `**Gel:** ${gelLabel}\n` +
      `**Valor:** ${fmtVal(value)}\n\n` +
      `**Jogadores:**\n` +
      players.map((p,i)=>`\`${i+1}.\` <@${p.id}> — **${p.nick}**`).join('\n') +
      `\n\n> Clique em **✅ Confirmar AP** para confirmar sua presença!`
    )
    .setFooter({ text:`${ORG} • Aguardando confirmação` })
    .setTimestamp();

  await ch.send({
    content: players.map(p=>`<@${p.id}>`).join(' '),
    embeds:  [embed],
    components: [
      new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`conf_${ch.id}`).setLabel('✅ Confirmar AP').setStyle(ButtonStyle.Success),
      ),
    ],
  });

  // Menu do mediador também fica disponível dentro do canal da aposta.
  // As ações continuam protegidas: somente staff ou administrador pode usá-las.
  await ch.send({
    embeds: [new EmbedBuilder()
      .setColor(0x5865F2)
      .setTitle(`⚖️ MENU DO MEDIADOR — ${ORG}`)
      .setDescription(
        `**Aposta:** ${mode.toUpperCase()} — ${platLabel2}\n` +
        `**Valor:** ${fmtVal(value)}\n\n` +
        `> Somente mediadores e administradores podem usar este menu.`
      )
      .setFooter({ text: `${ORG} • Painel da aposta` })
      .setTimestamp()],
    components: [buildMediadorMenu(ch.id)],
  });

  // Enviar menu do mediador no canal fila-mediador
  if (config.medChannel) {
    try {
      const medCh = await guild.channels.fetch(config.medChannel);
      await medCh.send({
        embeds:[new EmbedBuilder().setColor(0xFFAA00)
          .setTitle(`⚔️ NOVA FILA — ${channelName}`)
          .setDescription(
            `**Modo:** ${mode.toUpperCase()} — ${platLabel2}\n` +
            `**Gel:** ${gelLabel}\n` +
            `**Valor:** ${fmtVal(value)}\n` +
            `**Canal:** <#${ch.id}>\n\n` +
            `**Jogadores:**\n` +
            players.map((p,i)=>`\`${i+1}.\` <@${p.id}> — **${p.nick}**`).join('\n')
          )
          .setFooter({ text:`${ORG} • Painel Mediador` }).setTimestamp()],
        components:[buildFilaMediadorMenu(ch.id)],
      });
    } catch(e) { console.error('Erro ao enviar no canal mediador:', e); }
  }

  return ch;
}

// ── READY ──────────────────────────────────────────────────────────────
client.once('ready', () => {
  console.log(`✅ Bot online: ${client.user.tag}`);
  garantirEmojisDaFila();
  setInterval(async () => {
    if (!config.promoChannels?.length) return;
    const embed = new EmbedBuilder().setColor(0xFFAA00)
      .setTitle(`⭐ MELHOR ORG DE TODAS ⭐`)
      .setDescription(`> 🏆 **${ORG}** — Apostas Free Fire!\n> 💰 Seguro, rápido e confiável!\n> ⚡ Entre na fila agora!`)
      .setFooter({ text:`${ORG} • Free Fire` }).setTimestamp();
    for (const chId of config.promoChannels) {
      try { const c=await client.channels.fetch(chId); if(c) await c.send({embeds:[embed]}); } catch {}
    }
  }, 20*60*1000);
});

// ── COMMANDS ───────────────────────────────────────────────────────────
client.on('messageCreate', async (msg) => {
  if (!msg.guild || msg.author.bot || !msg.content.startsWith('!')) return;
  const args = msg.content.slice(1).trim().split(/ +/);
  const cmd  = args.shift().toLowerCase();
  const isAdmin = msg.member.permissions.has(PermissionFlagsBits.Administrator);
  const isStaff = config.staffRole && msg.member.roles.cache.has(config.staffRole);
  if (!config.players) config.players = {};
  function getPlayer(id) {
    if (!config.players[id]) config.players[id] = { vitorias:0, partidas:0, perdas:0 };
    return config.players[id];
  }

  // !fila <modo> <plat> <valor>
  if (cmd === 'fila') {
    if (!isAdmin && !isStaff) return msg.reply('❌ Sem permissão.');
    const mode  = args[0]?.toLowerCase();
    const plat  = args[1]?.toLowerCase();
    const value = parseFloat(String(args[2] || '').replace(',','.'));
    if (!MODES[mode])           return msg.reply(`❌ Modo inválido. Use: ${Object.keys(MODES).join(', ')}`);
    if (!PLATS.includes(plat))  return msg.reply('❌ Plataforma inválida. Use: mobile, emu ou misto');
    if (isNaN(value)||value<=0) return msg.reply('❌ Valor inválido. Ex: !fila 1v1 mobile 10');
    const k = getFilaKey(mode,plat,value);
    filas[k] = { normal:[], infinito:[] };
    try {
      const embed = buildFilaEmbed(mode,plat,value);
      const btns  = buildFilaButtons(mode,plat,value);
      await msg.reply({ embeds:[embed], components:btns, files:filaFiles() });
    } catch(e) {
      console.error('Erro fila:', e);
      msg.reply('❌ Erro: ' + e.message);
    }
    return;
  }

  // !allfilas <modo> <plat> — publica os painéis dos valores padrão
  if (cmd === 'allfilas') {
    if (!isAdmin && !isStaff) return msg.reply('❌ Sem permissão.');

    const mode = args[0]?.toLowerCase();
    const plat = args[1]?.toLowerCase();
    if (!MODES[mode]) return msg.reply(`❌ Modo inválido. Use: ${Object.keys(MODES).join(', ')}`);
    if (!PLATS.includes(plat)) return msg.reply('❌ Plataforma inválida. Use: mobile, emu ou misto');

    try {
      await msg.delete().catch(() => {});
      for (const value of ALL_FILA_VALUES) {
        const k = getFilaKey(mode, plat, value);
        filas[k] = { normal: [], infinito: [] };
        await msg.channel.send({
          embeds: [buildFilaEmbed(mode, plat, value)],
          components: buildFilaButtons(mode, plat, value),
          files: filaFiles(),
        });
      }
      await msg.channel.send(
        `✅ Painéis criados para **${mode.toUpperCase()} ${plat}**: ` +
        `${ALL_FILA_VALUES.map(value => fmtVal(value)).join(', ')}`
      );
      saveFilas();
    } catch (e) {
      console.error('Erro allfilas:', e);
      await msg.channel.send('❌ Não foi possível criar todas as filas. Verifique as permissões do bot.');
    }
    return;
  }

  // !c — renomeia canal para fila-XXXX
  if (cmd === 'c') {
    if (!isAdmin && !isStaff) return msg.reply('❌ Sem permissão.');
    try { await msg.channel.setName(`fila-${rnd(4)}`); msg.delete().catch(()=>{}); }
    catch { msg.reply('❌ Erro ao renomear.'); }
    return;
  }

  // !pg — renomeia canal para pagar-[total]
  if (cmd === 'pg') {
    if (!isAdmin && !isStaff) return msg.reply('❌ Sem permissão.');
    const info = canais[msg.channel.id];
    if (!info) return msg.reply('❌ Canal de fila não encontrado.');
    const total = info.value * info.players.length;
    const totalStr = total.toFixed(2).replace('.',',');
    try { await msg.channel.setName(`pagar-${totalStr}`); msg.delete().catch(()=>{}); }
    catch { msg.reply('❌ Erro ao renomear.'); }
    return;
  }

  // !registrar pix <gmail> <nome>
  if (cmd === 'registrar' && args[0]?.toLowerCase()==='pix') {
    if (!isAdmin && !isStaff) return msg.reply('❌ Só staff pode registrar PIX!');
    const gmail = args[1];
    const nome  = args.slice(2).join(' ');
    if (!gmail||!nome) return msg.reply('❌ Use: `!registrar pix seugmail@gmail.com Seu Nome`');
    if (!config.pixStaff) config.pixStaff = {};
    config.pixStaff[msg.author.id] = { gmail, nome };
    saveConfig();
    msg.reply({ embeds:[new EmbedBuilder().setColor(0x00C896).setTitle(`✅ PIX Registrado — ${ORG}`)
      .setDescription(`**Gmail:** \`${gmail}\`\n**Nome:** \`${nome}\``)
      .setFooter({ text:ORG }).setTimestamp()] });
    return;
  }

  // !ticket — publica o painel de atendimento
  if (cmd === 'ticket' || cmd === 'painelticket') {
    if (!isAdmin && !isStaff) return msg.reply('❌ Sem permissão.');
    const ticketEmbed = new EmbedBuilder()
      .setColor(0xE74C3C)
      .setTitle('🎫 CENTRAL DE ATENDIMENTO')
      .setDescription(
        `Olá! Selecione abaixo o motivo do seu atendimento.\n\n` +
        `Um canal privado será criado somente para você e a equipe responsável.\n\n` +
        `> ⚠️ Não abra tickets repetidos. Aguarde a equipe responder.`
      )
      .setFooter({ text:`${ORG} • Sistema de Tickets` })
      .setTimestamp();
    await msg.channel.send({ embeds:[ticketEmbed], components:[buildTicketMenu()] });
    if (cmd === 'painelticket') msg.delete().catch(()=>{});
    return;
  }

  // !setticketcat <id> — define a categoria dos tickets
  if (cmd === 'setticketcat') {
    if (!isAdmin) return msg.reply('❌ Só administradores podem definir a categoria.');
    if (!args[0]) return msg.reply('❌ Use: `!setticketcat ID_DA_CATEGORIA`');
    config.ticketCategory = args[0];
    saveConfig();
    return msg.reply(`✅ Categoria dos tickets definida: <#${args[0]}>`);
  }

  // !setticketrole @cargo — define quem pode ver os tickets
  if (cmd === 'setticketrole') {
    if (!isAdmin) return msg.reply('❌ Só administradores podem definir o cargo.');
    const role = msg.mentions.roles.first();
    if (!role) return msg.reply('❌ Mencione o cargo. Ex: `!setticketrole @Suporte`');
    config.ticketStaffRole = role.id;
    saveConfig();
    return msg.reply(`✅ Cargo dos tickets definido: ${role}`);
  }

  // !mediador — envia o menu de mediador no canal atual
  if (cmd === 'mediador') {
    if (!isAdmin && !isStaff) return msg.reply('❌ Sem permissão.');
    const info = canais[msg.channel.id];
    if (!info) return msg.reply('❌ Este canal não é uma fila de apostas.');
    msg.delete().catch(()=>{});
    await msg.channel.send({
      embeds:[new EmbedBuilder().setColor(0xFFAA00)
        .setTitle(`⚖️ PAINEL DO MEDIADOR — ${ORG}`)
        .setDescription(
          `**Canal:** ${msg.channel.name}\n` +
          `**Modo:** ${info.mode?.toUpperCase()}\n` +
          `**Valor:** ${fmtVal(info.value)}\n` +
          `**Mediador em serviço:** ${info.mediador ? `<@${info.mediador}>` : '❌ Nenhum'}\n\n` +
          `> Selecione uma ação no menu abaixo:`
        )
        .setFooter({ text:ORG }).setTimestamp()],
      components:[buildMediadorMenu(msg.channel.id)],
    });
    return;
  }
  // !painelmediador — painel fixo pra mediadores entrarem em serviço
  if (cmd === 'painelmediador') {
    if (!isAdmin && !isStaff) return msg.reply('❌ Sem permissão.');
    msg.delete().catch(()=>{});
    const onDuty = config.mediadorOnDuty;
    await msg.channel.send({
      embeds:[new EmbedBuilder().setColor(0xFFAA00)
        .setTitle(`⚖️ PAINEL DO MEDIADOR — ${ORG}`)
        .setDescription(
          `> Clique em **🟢 Entrar em Serviço** para ficar disponível!\n` +
          `> Quando os jogadores confirmarem o AP, seu PIX será enviado automaticamente.\n\n` +
          `**⚠️ Você precisa ter o PIX registrado!**\n` +
          `Use: \`!registrar pix seugmail@gmail.com Seu Nome\``
        )
        .addFields({ name:'🟢 Mediador em Serviço', value: onDuty ? `<@${onDuty}>` : '_Nenhum no momento_' })
        .setFooter({ text:ORG }).setTimestamp()],
      components:[new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('med_entrar_servico').setLabel('🟢 Entrar em Serviço').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId('med_sair_servico').setLabel('🔴 Sair de Serviço').setStyle(ButtonStyle.Danger),
      )],
    });
    return;
  }

  if (cmd === 'vitoria') {
    const target = msg.mentions.members.first() || msg.member;
    const p = getPlayer(target.id);
    msg.reply({ embeds:[new EmbedBuilder().setColor(0xFFD700).setTitle(`🏆 ESTATÍSTICAS — ${ORG}`)
      .setThumbnail(target.user.displayAvatarURL())
      .setDescription(`**Jogador:** ${target.displayName}`)
      .addFields(
        { name:'🏆 Vitórias',         value:`**${p.vitorias}**`, inline:true },
        { name:'🎮 Partidas Ganhas',   value:`**${p.partidas}**`, inline:true },
        { name:'💀 Partidas Perdidas', value:`**${p.perdas}**`,   inline:true },
      )
      .setFooter({ text:`${ORG} • Free Fire` }).setTimestamp()] });
    return;
  }

  // !addvitoria @player — adm adiciona vitória manual
  if (cmd === 'addvitoria') {
    if (!isAdmin) return msg.reply('❌ Sem permissão.');
    const target = msg.mentions.members.first();
    if (!target) return msg.reply('❌ Mencione um jogador.');
    const p = getPlayer(target.id); p.vitorias++; p.partidas++; saveConfig();
    msg.reply(`✅ +1 vitória para ${target.displayName}!`);
    return;
  }

  // !addderrota @player — adm adiciona derrota manual
  if (cmd === 'addderrota') {
    if (!isAdmin) return msg.reply('❌ Sem permissão.');
    const target = msg.mentions.members.first();
    if (!target) return msg.reply('❌ Mencione um jogador.');
    const p = getPlayer(target.id); p.perdas++; saveConfig();
    msg.reply(`✅ +1 derrota para ${target.displayName}!`);
    return;
  }

  // !clear <quantidade> — deletar até 1200 mensagens
  if (cmd === 'clear') {
    if (!isAdmin && !isStaff) return msg.reply('❌ Sem permissão.');
    const amount = parseInt(args[0]);
    if (isNaN(amount) || amount < 1 || amount > 1200)
      return msg.reply('❌ Use um número entre 1 e 1200. Ex: `!clear 100`');
    msg.delete().catch(()=>{});
    let deleted = 0;
    const batches = Math.ceil(amount / 100);
    for (let i = 0; i < batches; i++) {
      const toDelete = Math.min(100, amount - deleted);
      try {
        const fetched = await msg.channel.messages.fetch({ limit: toDelete });
        if (fetched.size === 0) break;
        const bulk = fetched.filter(m => Date.now() - m.createdTimestamp < 14 * 24 * 60 * 60 * 1000);
        if (bulk.size > 0) await msg.channel.bulkDelete(bulk, true);
        deleted += bulk.size;
        if (bulk.size < toDelete) break;
        await new Promise(r => setTimeout(r, 1000));
      } catch { break; }
    }
    const reply = await msg.channel.send(`✅ **${deleted}** mensagens deletadas!`);
    setTimeout(() => reply.delete().catch(()=>{}), 3000);
    return;
  }

  // !lock — fechar canal (ninguém pode falar)
  if (cmd === 'lock') {
    if (!isAdmin && !isStaff) return msg.reply('❌ Sem permissão.');
    try {
      await msg.channel.permissionOverwrites.edit(msg.guild.id, { SendMessages: false });
      msg.delete().catch(()=>{});
      const reply = await msg.channel.send('🔒 **Canal fechado!** Ninguém pode enviar mensagens.');
      setTimeout(() => reply.delete().catch(()=>{}), 4000);
    } catch { msg.reply('❌ Erro ao fechar canal.'); }
    return;
  }

  // !unlock — abrir canal
  if (cmd === 'unlock') {
    if (!isAdmin && !isStaff) return msg.reply('❌ Sem permissão.');
    try {
      await msg.channel.permissionOverwrites.edit(msg.guild.id, { SendMessages: null });
      msg.delete().catch(()=>{});
      const reply = await msg.channel.send('🔓 **Canal aberto!** Podem enviar mensagens novamente.');
      setTimeout(() => reply.delete().catch(()=>{}), 4000);
    } catch { msg.reply('❌ Erro ao abrir canal.'); }
    return;
  }

  if (cmd==='setthumb') {
    if(!isAdmin)return;
    const url = args[0];
    if(!url) return msg.reply('❌ Use: `!setthumb <url da imagem>`');
    config.thumbUrl = url; saveConfig();
    msg.reply(`✅ Thumbnail definida!`);
  }
  // !setgelo <url> — troca a foto exibida nos painéis das filas
  if (cmd==='setgelo') {
    if(!isAdmin) return msg.reply('❌ Só administradores podem trocar a foto do gelo.');
    const url = args[0];
    if(!url || !/^https?:\/\/\S+/i.test(url))
      return msg.reply('❌ Use: `!setgelo https://link-da-sua-imagem.com/gelo.png`');
    config.gelUrl = url;
    saveConfig();
    return msg.reply('✅ Foto do gelo atualizada! As próximas filas já usarão essa imagem.');
  }
  // !setumpemoji — cria um emoji personalizado usando uma imagem anexada
  if (cmd==='setumpemoji') {
    if(!isAdmin) return msg.reply('❌ Só administradores podem criar o emoji.');
    const anexo = msg.attachments.first();
    if(!anexo) return msg.reply('❌ Anexe a foto da UMP XM8 na mesma mensagem do comando `!setumpemoji`.');
    try {
      const emoji = await msg.guild.emojis.create({
        attachment: anexo.url,
        name: 'umpxm8',
      });
      config.umpEmojiId = emoji.id;
      saveConfig();
      return msg.reply(`✅ Emoji criado: ${emoji}\nAgora ele aparece no botão **Full UMP XM8**.`);
    } catch (e) {
      console.error('Erro ao criar emoji UMP XM8:', e);
      return msg.reply('❌ Não consegui criar o emoji. Ative **Gerenciar Expressões** para o bot e tente novamente.');
    }
  }
  // !setgelemoji — cria o emoji do Gel Normal usando uma imagem anexada
  if (cmd==='setgelemoji') {
    if(!isAdmin) return msg.reply('❌ Só administradores podem criar o emoji.');
    const anexo = msg.attachments.first();
    if(!anexo) return msg.reply('❌ Anexe a foto do gelo normal na mesma mensagem do comando `!setgelemoji`.');
    try {
      const emoji = await msg.guild.emojis.create({
        attachment: anexo.url,
        name: 'gelnormal',
      });
      config.gelEmojiId = emoji.id;
      saveConfig();
      return msg.reply(`✅ Emoji do Gel Normal criado: ${emoji}\nAgora ele aparece somente no botão do Gel Normal.`);
    } catch (e) {
      console.error('Erro ao criar emoji do Gel Normal:', e);
      return msg.reply('❌ Não consegui criar o emoji. Ative **Gerenciar Expressões** para o bot e tente novamente.');
    }
  }
  if (cmd==='setmedchannel') {
    if(!isAdmin)return;
    const ch = msg.mentions.channels.first();
    if(!ch) return msg.reply('❌ Mencione o canal. Ex: `!setmedchannel #fila-mediador`');
    config.medChannel = ch.id; saveConfig();
    msg.reply(`✅ Canal de mediadores definido: ${ch}`);
  }
  if (cmd==='setstaff')   { if(!isAdmin)return; const r=msg.mentions.roles.first();if(!r)return; config.staffRole=r.id; saveConfig(); msg.reply(`✅ Staff: ${r}`); }
  if (cmd==='setfilacat') { if(!isAdmin)return; config.filaCategory=args[0]; saveConfig(); msg.reply(`✅ Categoria: \`${args[0]}\``); }
  if (cmd==='setpromo')   { if(!isAdmin)return; const ch=msg.mentions.channels.first();if(!ch)return; if(!config.promoChannels)config.promoChannels=[]; if(!config.promoChannels.includes(ch.id))config.promoChannels.push(ch.id); saveConfig(); msg.reply(`✅ Canal ${ch} adicionado.`); }
});

// ── INTERACTIONS ───────────────────────────────────────────────────────
client.on('interactionCreate', async (interaction) => {
  const id = interaction.customId || '';

  // ── ENTRAR EM SERVIÇO (painel global) ────────────────────────────────
  if (id === 'med_entrar_servico') {
    const isStaff = config.staffRole && interaction.member.roles.cache.has(config.staffRole);
    const isAdmin = interaction.member.permissions.has(PermissionFlagsBits.Administrator);
    if (!isStaff && !isAdmin) return interaction.reply({ content:'❌ Sem permissão.', ephemeral:true });
    const pixInfo = config.pixStaff?.[interaction.user.id];
    if (!pixInfo) return interaction.reply({ content:'❌ Registre seu PIX primeiro!\nUse: `!registrar pix seugmail@gmail.com Seu Nome`', ephemeral:true });
    config.mediadorOnDuty = interaction.user.id;
    saveConfig();
    // Atualizar o painel
    try {
      await interaction.message.edit({
        embeds:[new EmbedBuilder().setColor(0xFFAA00)
          .setTitle(`⚖️ PAINEL DO MEDIADOR — ${ORG}`)
          .setDescription(
            `> Clique em **🟢 Entrar em Serviço** para ficar disponível!\n` +
            `> Quando os jogadores confirmarem o AP, seu PIX será enviado automaticamente.\n\n` +
            `**⚠️ Você precisa ter o PIX registrado!**\n` +
            `Use: \`!registrar pix seugmail@gmail.com Seu Nome\``
          )
          .addFields({ name:'🟢 Mediador em Serviço', value:`<@${interaction.user.id}>` })
          .setFooter({ text:ORG }).setTimestamp()],
        // interaction.message.components já é uma lista de ActionRows.
        // Não envolver novamente em outra lista, senão o Discord rejeita a edição.
        components:interaction.message.components,
      });
    } catch {}
    return interaction.reply({ content:`✅ Você entrou em serviço! Seu PIX \`${pixInfo.gmail}\` será enviado quando os jogadores confirmarem.`, ephemeral:true });
  }

  // ── SAIR DE SERVIÇO (painel global) ──────────────────────────────────
  if (id === 'med_sair_servico') {
    const isStaff = config.staffRole && interaction.member.roles.cache.has(config.staffRole);
    const isAdmin = interaction.member.permissions.has(PermissionFlagsBits.Administrator);
    if (!isStaff && !isAdmin) return interaction.reply({ content:'❌ Sem permissão.', ephemeral:true });
    if (config.mediadorOnDuty !== interaction.user.id && !isAdmin)
      return interaction.reply({ content:'❌ Você não está em serviço.', ephemeral:true });
    config.mediadorOnDuty = null;
    saveConfig();
    try {
      await interaction.message.edit({
        embeds:[new EmbedBuilder().setColor(0xFFAA00)
          .setTitle(`⚖️ PAINEL DO MEDIADOR — ${ORG}`)
          .setDescription(
            `> Clique em **🟢 Entrar em Serviço** para ficar disponível!\n` +
            `> Quando os jogadores confirmarem o AP, seu PIX será enviado automaticamente.\n\n` +
            `**⚠️ Você precisa ter o PIX registrado!**\n` +
            `Use: \`!registrar pix seugmail@gmail.com Seu Nome\``
          )
          .addFields({ name:'🟢 Mediador em Serviço', value:'_Nenhum no momento_' })
          .setFooter({ text:ORG }).setTimestamp()],
        components:interaction.message.components,
      });
    } catch {}
    return interaction.reply({ content:'✅ Você saiu de serviço!', ephemeral:true });
  }

  // ── ABRIR TICKET ───────────────────────────────────────────────────────
  if (interaction.isStringSelectMenu() && interaction.customId === 'ticket_menu') {
    const type = TICKET_TYPES[interaction.values[0]];
    if (!type) return interaction.reply({ content:'❌ Tipo de ticket inválido.', ephemeral:true });

    const ticketTopic = `ticket:${interaction.user.id}:${interaction.values[0]}`;
    const existing = interaction.guild.channels.cache.find(ch => ch.topic === ticketTopic);
    if (existing)
      return interaction.reply({ content:`⚠️ Você já tem um ticket aberto: ${existing}`, ephemeral:true });

    const staffRoleId = config.ticketStaffRole || config.staffRole;
    let ticketChannel;
    try {
      ticketChannel = await interaction.guild.channels.create({
        name:`ticket-${interaction.values[0]}-${interaction.user.username}`.toLowerCase().replace(/[^a-z0-9-]/g,'').slice(0,90),
        type:ChannelType.GuildText,
        parent:config.ticketCategory || null,
        topic:ticketTopic,
        permissionOverwrites:[
          { id:interaction.guild.id, deny:[PermissionFlagsBits.ViewChannel] },
          { id:interaction.user.id, allow:[
            PermissionFlagsBits.ViewChannel,
            PermissionFlagsBits.SendMessages,
            PermissionFlagsBits.ReadMessageHistory,
          ] },
          ...(staffRoleId ? [{ id:staffRoleId, allow:[
            PermissionFlagsBits.ViewChannel,
            PermissionFlagsBits.SendMessages,
            PermissionFlagsBits.ReadMessageHistory,
          ] }] : []),
          { id:client.user.id, allow:[
            PermissionFlagsBits.ViewChannel,
            PermissionFlagsBits.SendMessages,
            PermissionFlagsBits.ReadMessageHistory,
            PermissionFlagsBits.ManageChannels,
          ] },
        ],
      });
    } catch (e) {
      console.error('Erro ao criar ticket:', e);
      return interaction.reply({ content:'❌ Não consegui criar o ticket. Verifique a categoria e as permissões do bot.', ephemeral:true });
    }

    await ticketChannel.send({
      content:`<@${interaction.user.id}>${staffRoleId ? ` <@&${staffRoleId}>` : ''}`,
      embeds:[new EmbedBuilder()
        .setColor(0xE74C3C)
        .setTitle(`${type.emoji} TICKET — ${type.label}`)
        .setDescription(
          `Olá, <@${interaction.user.id}>!\n\n` +
          `Explique seu atendimento com o máximo de detalhes possível. ` +
          `A equipe responderá assim que estiver disponível.\n\n` +
          `> Tipo: **${type.label}**`
        )
        .setFooter({ text:`${ORG} • Atendimento` })
        .setTimestamp()],
      components:[new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`ticket_close_${ticketChannel.id}`)
          .setLabel('Fechar Ticket')
          .setEmoji('🔒')
          .setStyle(ButtonStyle.Danger),
      )],
    });

    return interaction.reply({ content:`✅ Seu ticket foi criado: ${ticketChannel}`, ephemeral:true });
  }

  // ── MENU MEDIADOR ──────────────────────────────────────────────────────
  if (interaction.isStringSelectMenu() && interaction.customId.startsWith('med_')) {
    const channelId = interaction.customId.replace('med_','');
    const info      = canais[channelId];
    const isStaff   = config.staffRole && interaction.member.roles.cache.has(config.staffRole);
    const isAdmin   = interaction.member.permissions.has(PermissionFlagsBits.Administrator);
    if (!isStaff && !isAdmin) return interaction.reply({ content:'❌ Só mediadores!', ephemeral:true });
    const acao = interaction.values[0];

    // SAIR DE SERVIÇO
    if (acao === 'sairserv') {
      if (!info) return interaction.reply({ content:'❌ Canal não encontrado.', ephemeral:true });
      if (info.mediador !== interaction.user.id && !isAdmin)
        return interaction.reply({ content:'❌ Você não está em serviço neste canal.', ephemeral:true });
      info.mediador = null; saveCanais();
      return interaction.reply({ embeds:[new EmbedBuilder().setColor(0xE74C3C)
        .setTitle('🔴 MEDIADOR SAIU DE SERVIÇO')
        .setDescription(`${interaction.user} saiu do serviço.`)
        .setFooter({ text:ORG }).setTimestamp()] });
    }

    // ENTRAR EM SERVIÇO
    if (acao === 'servico') {
      if (!info) return interaction.reply({ content:'❌ Canal não encontrado.', ephemeral:true });
      const pixInfo = config.pixStaff?.[interaction.user.id];
      if (!pixInfo) return interaction.reply({ content:'❌ Registre seu PIX primeiro!\nUse: `!registrar pix seugmail@gmail.com Seu Nome`', ephemeral:true });
      info.mediador = interaction.user.id;
      saveCanais();

      await interaction.reply({ embeds:[new EmbedBuilder().setColor(0x2ECC71)
        .setTitle('🟢 MEDIADOR EM SERVIÇO')
        .setDescription(`${interaction.user} entrou em serviço!\nPIX: \`${pixInfo.gmail}\``)
        .setFooter({ text:ORG }).setTimestamp()] });

      // Se jogadores já confirmaram todos → manda PIX agora
      const totalPlayers = info.players.length;
      const totalConfirmados = info.confirmados?.length || 0;
      if (totalConfirmados >= totalPlayers) {
        const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(pixInfo.gmail)}`;
        try {
          const filaCh = await client.channels.fetch(channelId);
          await filaCh.send({ embeds:[new EmbedBuilder().setColor(0x00C896)
            .setTitle('✅ PIX DO MEDIADOR — Pague agora!')
            .setDescription(
              `> Mediador entrou em serviço! Pague agora! 💰\n\n` +
              `**📲 PIX:** \`${pixInfo.gmail}\`\n` +
              `**👤 Nome:** \`${pixInfo.nome}\`\n\n` +
              `**Valor:** ${fmtVal(info.value)}\n` +
              `**Total:** ${fmtVal(info.value * info.players.length)}\n\n` +
              `> QR Code abaixo 👇`
            )
            .setImage(qrUrl)
            .setFooter({ text:`${ORG} • Free Fire` }).setTimestamp()] });
        } catch {}
      }
      return;
    }

    // FINALIZAR
    if (acao === 'finalizar') {
      await interaction.reply({ embeds:[new EmbedBuilder().setColor(0xE74C3C)
        .setTitle('🏁 APOSTA FINALIZADA')
        .setDescription(`Finalizado por ${interaction.user}.\nCanal deletado em 5s.`).setTimestamp()] });
      delete canais[channelId]; saveCanais();
      // O menu também pode ser usado no canal fila-mediador. Nesse caso,
      // interaction.channel não é o canal da aposta.
      setTimeout(async ()=>{
        try {
          const filaCh = await client.channels.fetch(channelId);
          await filaCh.delete();
        } catch {}
      }, 5000);
      return;
    }

    // ESCOLHER VENCEDOR
    if (acao === 'vencedor') {
      if (!info) return interaction.reply({ content:'❌ Dados não encontrados.', ephemeral:true });
      const btns = info.players.slice(0,5).map(p =>
        new ButtonBuilder().setCustomId(`win_${channelId}_${p.id}`).setLabel(p.nick).setStyle(ButtonStyle.Success)
      );
      return interaction.reply({
        embeds:[new EmbedBuilder().setColor(0x2ECC71).setTitle('🏆 Escolher Vencedor').setDescription('Quem ganhou a aposta?').setTimestamp()],
        components:[new ActionRowBuilder().addComponents(btns)], ephemeral:true
      });
    }

    // W.O
    if (acao === 'wo') {
      if (!info) return interaction.reply({ content:'❌ Dados não encontrados.', ephemeral:true });
      const btns = info.players.slice(0,5).map(p =>
        new ButtonBuilder().setCustomId(`wo_${channelId}_${p.id}`).setLabel(p.nick).setStyle(ButtonStyle.Primary)
      );
      return interaction.reply({
        embeds:[new EmbedBuilder().setColor(0xE67E22).setTitle('⚠️ Vitória por W.O').setDescription('Quem ganhou por W.O?').setTimestamp()],
        components:[new ActionRowBuilder().addComponents(btns)], ephemeral:true
      });
    }

    // LIBERAR PIX
    if (acao === 'pix') {
      if (!info) return interaction.reply({ content:'❌ Dados não encontrados.', ephemeral:true });
      let filaCh;
      try { filaCh = await client.channels.fetch(channelId); } catch {}
      if (!filaCh) return interaction.reply({ content:'❌ Canal da aposta não encontrado.', ephemeral:true });
      for (const p of info.players) {
        try { await filaCh.permissionOverwrites.edit(p.id,{ ViewChannel:true, SendMessages:true }); } catch {}
      }
      info.pixLiberado = true; saveCanais();
      await filaCh.send({ embeds:[new EmbedBuilder().setColor(0x00C896)
        .setTitle('💳 PIX LIBERADO!')
        .setDescription('> Os jogadores agora podem enviar mensagens!\n> Envie o comprovante.')
        .setTimestamp()] });
      return interaction.reply({ content:`✅ PIX liberado no canal <#${channelId}>.`, ephemeral:true });
    }

    return interaction.reply({ content:'❌ Opção inválida.', ephemeral:true });
  }

  if (!interaction.isButton()) return;

  // ── FECHAR TICKET ──────────────────────────────────────────────────────
  if (id.startsWith('ticket_close_')) {
    const ticketChannel = interaction.channel;
    const isStaff = config.ticketStaffRole
      ? interaction.member.roles.cache.has(config.ticketStaffRole)
      : (config.staffRole && interaction.member.roles.cache.has(config.staffRole));
    const isAdmin = interaction.member.permissions.has(PermissionFlagsBits.Administrator);
    const isOwner = ticketChannel.topic?.startsWith(`ticket:${interaction.user.id}:`);
    if (!isStaff && !isAdmin && !isOwner)
      return interaction.reply({ content:'❌ Você não pode fechar este ticket.', ephemeral:true });

    await interaction.reply({ content:'🔒 Ticket fechado. O canal será apagado em 5 segundos.' });
    setTimeout(()=>ticketChannel.delete().catch(()=>{}), 5000);
    return;
  }

  // ── BOTÃO CONFIRMAR AP ─────────────────────────────────────────────────
  if (id.startsWith('conf_')) {
    const channelId = id.replace('conf_','');
    const info      = canais[channelId];
    if (!info) return interaction.reply({ content:'❌ Dados não encontrados.', ephemeral:true });

    const isPlayer = info.players.find(p=>p.id===interaction.user.id);
    if (!isPlayer) return interaction.reply({ content:'❌ Você não faz parte desta fila.', ephemeral:true });

    if (!info.confirmados) info.confirmados = [];
    if (info.confirmados.includes(interaction.user.id))
      return interaction.reply({ content:'⚠️ Você já confirmou!', ephemeral:true });

    info.confirmados.push(interaction.user.id);
    saveCanais();

    await interaction.reply({ content:`✅ <@${interaction.user.id}> confirmou! (${info.confirmados.length}/${info.players.length})` });

    // Quando todos confirmaram → mandar PIX do mediador em serviço
    if (info.confirmados.length >= info.players.length) {
      // O painel só fica disponível depois que todos confirmarem o AP.
      // Assim o mediador consegue liberar PIX, escolher vencedor, aplicar
      // W.O. ou finalizar a aposta no próprio canal da partida.
      await interaction.channel.send({
        embeds:[new EmbedBuilder().setColor(0x5865F2)
          .setTitle(`⚖️ MENU DO MEDIADOR — AP CONFIRMADO`)
          .setDescription(
            `✅ Todos os jogadores confirmaram o AP!\n\n` +
            `**Aposta:** ${info.mode.toUpperCase()} — ${info.plat.toUpperCase()}\n` +
            `**Valor:** ${fmtVal(info.value)}\n\n` +
            `> Mediadores: use o menu abaixo para liberar o PIX, ` +
            `registrar o vencedor, aplicar W.O. ou finalizar.`
          )
          .setFooter({ text:`${ORG} • Painel liberado após confirmação` })
          .setTimestamp()],
        components:[buildMediadorMenu(channelId)],
      });

      const mediadorId = info.mediador || config.mediadorOnDuty;
      const pixInfo    = config.pixStaff?.[mediadorId];

      if (!pixInfo) {
        await interaction.channel.send({ embeds:[new EmbedBuilder().setColor(0xE74C3C)
          .setTitle('⚠️ Nenhum mediador em serviço!')
          .setDescription('> Aguarde um mediador entrar em serviço!').setTimestamp()] });
        return;
      }

      // Gerar QR Code via API pública
      const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(pixInfo.gmail)}`;

      await interaction.channel.send({ embeds:[new EmbedBuilder().setColor(0x00C896)
        .setTitle('✅ TODOS CONFIRMARAM — Pague o Mediador!')
        .setDescription(
          `> Todos confirmaram! Pague o mediador agora! 💰\n\n` +
          `**📲 PIX do Mediador:**\n\`\`\`${pixInfo.gmail}\`\`\`` +
          `\n**👤 Nome:** \`${pixInfo.nome}\`\n\n` +
          `**Valor:** ${fmtVal(info.value)}\n` +
          `**Total:** ${fmtVal(info.value * info.players.length)}\n\n` +
          `> QR Code abaixo 👇`
        )
        .setImage(qrUrl)
        .setFooter({ text:`${ORG} • Free Fire` }).setTimestamp()] });
    }
    return;
  }

  // ── ENTRAR NA FILA ─────────────────────────────────────────────────────
  if (id.startsWith('fn_') || id.startsWith('fi_')) {
    try {
      const parts   = id.split('_');
      const gelType = parts[0]==='fn' ? 'normal' : 'infinito';
       const gelLabel= gelType==='normal' ? '🧊 Gel Normal' : '🔫 Full UMP XM8';
      const mode    = parts[1];
      const plat    = parts[2];
      const value   = parseFloat(parts[3]);
      const maxP    = MODES[mode];
      if (!maxP) return interaction.reply({ content:'❌ Modo inválido.', ephemeral:true });

      const fila    = getFila(mode,plat,value);
      const subFila = fila[gelType];

      if (fila.normal.find(p=>p.id===interaction.user.id) || fila.infinito.find(p=>p.id===interaction.user.id))
        return interaction.reply({ content:'⚠️ Você já está na fila!', ephemeral:true });
      if (subFila.length >= maxP)
        return interaction.reply({ content:`❌ Fila ${gelLabel} cheia!`, ephemeral:true });

      const nick = interaction.member.displayName;
      subFila.push({ id:interaction.user.id, name:interaction.user.username, nick });
      saveFilas();

      try { await interaction.message.edit({ embeds:[buildFilaEmbed(mode,plat,value)], components:buildFilaButtons(mode,plat,value) }); } catch {}
      await interaction.reply({ content:`✅ Entrou na fila **${mode.toUpperCase()} ${plat==='mobile'?'Mobile':'Emulador'}** — ${gelLabel} — ${fmtVal(value)}!`, ephemeral:true });

      if (subFila.length >= maxP) {
        const players = [...subFila];
        fila[gelType] = [];
        saveFilas();
        try { await interaction.message.edit({ embeds:[buildFilaEmbed(mode,plat,value)], components:buildFilaButtons(mode,plat,value) }); } catch {}
        await criarCanalFila(interaction.guild, mode, plat, value, players, gelType);
      }
    } catch(e) {
      console.error('Erro ao entrar na fila:', e);
      if (!interaction.replied) await interaction.reply({ content:'❌ Erro ao entrar na fila. Tente novamente!', ephemeral:true });
    }
    return;
  }

  // ── SAIR DA FILA ───────────────────────────────────────────────────────
  if (id.startsWith('fs_')) {
    const parts = id.split('_');
    const mode  = parts[1];
    const plat  = parts[2];
    const value = parseFloat(parts[3]);
    const fila  = getFila(mode,plat,value);
    let removido = false;
    for (const gel of ['normal','infinito']) {
      const idx = fila[gel].findIndex(p=>p.id===interaction.user.id);
      if (idx!==-1) { fila[gel].splice(idx,1); removido=true; break; }
    }
    if (!removido) return interaction.reply({ content:'⚠️ Você não está na fila.', ephemeral:true });
    saveFilas();
    try { await interaction.message.edit({ embeds:[buildFilaEmbed(mode,plat,value)], components:buildFilaButtons(mode,plat,value) }); } catch {}
    return interaction.reply({ content:'✅ Saiu da fila.', ephemeral:true });
  }

  // ── VENCEDOR / W.O ─────────────────────────────────────────────────────
  if (id.startsWith('win_') || id.startsWith('wo_')) {
    const isWo   = id.startsWith('wo_');
    const sem    = id.replace(isWo?'wo_':'win_','');
    const parts  = sem.split('_');
    const winnId = parts[parts.length-1];
    const chId   = parts.slice(0,-1).join('_');
    const info   = canais[chId];
    if (!info) return interaction.reply({ content:'❌ Dados não encontrados.', ephemeral:true });
    const isStaff = config.staffRole && interaction.member.roles.cache.has(config.staffRole);
    const isAdmin = interaction.member.permissions.has(PermissionFlagsBits.Administrator);
    if (!isStaff && !isAdmin) return interaction.reply({ content:'❌ Sem permissão.', ephemeral:true });
    const winner = info.players.find(p=>p.id===winnId);
    if (!winner) return interaction.reply({ content:'❌ Jogador não encontrado.', ephemeral:true });
    if (!config.players) config.players = {};
    if (!config.players[winnId]) config.players[winnId] = { vitorias:0, partidas:0, perdas:0 };
    config.players[winnId].vitorias++;
    config.players[winnId].partidas++;

    // Adicionar derrota pros outros
    for (const p of info.players) {
      if (p.id !== winnId) {
        if (!config.players[p.id]) config.players[p.id] = { vitorias:0, partidas:0, perdas:0 };
        config.players[p.id].perdas++;
      }
    }
    saveConfig();

    await interaction.reply({ embeds:[new EmbedBuilder().setColor(0xFFD700)
      .setTitle(isWo?'⚠️ VITÓRIA POR W.O!':'🏆 VENCEDOR DA APOSTA!')
      .setDescription(`> <@${winnId}> (**${winner.nick}**) ganhou${isWo?' por W.O':''}!\n\n🏆 +1 Vitória\n🎮 +1 Partida Ganha`)
      .setTimestamp()] });

    try {
      const user = await client.users.fetch(winnId);
      await user.send({ embeds:[new EmbedBuilder().setColor(0xFFD700)
        .setTitle(`🏆 PARABÉNS — ${ORG}`)
        .setDescription(`> Parabéns! Você ganhou${isWo?' por W.O':''}! 🎉\n\n✅ **+1 Vitória**\n✅ **+1 Partida Ganha**\n\nTotal: **${config.players[winnId].vitorias} vitórias**!`)
        .setFooter({ text:`${ORG} • Free Fire` }).setTimestamp()] });
    } catch {}
    return;
  }
});

const TOKEN = process.env.DISCORD_TOKEN || config.token || 'SEU_TOKEN_AQUI';
client.login(TOKEN);
