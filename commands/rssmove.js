const log = require('../util/logger.js')
const MenuUtils = require('./util/MenuUtils.js')
const FeedSelector = require('./util/FeedSelector.js')
const MIN_PERMISSION_BOT = ['VIEW_CHANNEL', 'SEND_MESSAGES']
const MIN_PERMISSION_USER = ['VIEW_CHANNEL', 'SEND_MESSAGES', 'MANAGE_CHANNELS']
const dbOps = require('../util/dbOps.js')

function inputChannel (m, data, callback) {
  const { guildRss, rssNameList } = data
  const rssList = guildRss.sources
  // const source = rssList[rssName]
  // const hasEmbed = source.embedMessage && source.embedMessage.properties
  const selected = m.mentions.channels.first()
  if (!selected) return callback(new SyntaxError('That is not a valid channel. Try again, or type `exit` to cancel.'))
  const me = m.guild.me
  let errors = ''
  if (!me.permissionsIn(selected).has(MIN_PERMISSION_BOT)) errors += `\nI am missing **Read Messages** or **Send Messages** permission in <#${selected.id}>.`
  if (!m.member.permissionsIn(selected).has(MIN_PERMISSION_USER)) errors += `\nYou are missing **Read Messages**, **Send Messages**, or **Manage Channel** permission in <#${selected.id}>.`
  // if (errors) errors += '\n'

  let feedSpecificErrors = ''
  for (var x = 0; x < rssNameList.length; ++x) {
    let curErrors = ''
    const rssName = rssNameList[x]
    const source = rssList[rssName]
    const hasEmbed = source.embedMessage && Object.keys(source.embedMessage).length > 0
    const sourceChannel = m.guild.channels.get(source.channel)

    if (sourceChannel && selected.id === sourceChannel.id) curErrors += `\nThe feed is already in that channel.`
    else {
      if (sourceChannel && !m.member.permissionsIn(sourceChannel).has(MIN_PERMISSION_USER)) errors += `\nYou are missing **Read Messages**, **Send Messages**, or **Manage Channel** permission in <#${sourceChannel.id}>.`
      if (hasEmbed && !me.permissionsIn(selected).has('EMBED_LINKS')) curErrors += `\nI am missing **Embed Links** permission in the <#${selected.id}>. To bypass this permission, you can reset this feed's embed via the rssembed command.`
      for (var n in rssList) {
        const cur = rssList[n]
        if (cur.channel === selected.id && cur.link === source.link && n !== rssName) errors += `\nA feed with this link already exists in that channel.`
      }
    }
    if (curErrors) feedSpecificErrors += `\n__Errors for <${source.link}>:__${curErrors}${x === rssNameList.length - 1 ? '' : '\n'}`
  }

  // Half the battle for this command is figuring out the right amount of new lines...

  if (feedSpecificErrors && errors) errors += '\n' + feedSpecificErrors
  else if (feedSpecificErrors) errors += feedSpecificErrors

  if (errors) return callback(new SyntaxError('Unable to move channel for the following reasons:\n' + errors + '\n\nTry again, or type `exit` to cancel.'))
  const summary = []
  for (var y = 0; y < rssNameList.length; ++y) {
    const source = rssList[rssNameList[y]]
    source.channel = selected.id
    summary.push(`<${source.link}>`)
  }
  dbOps.guildRss.update(guildRss)
  log.command.info(`Channel for feeds ${summary.join(',')} have been moved to ${selected.id} (${selected.name})`, m.guild, m.channel)
  m.channel.send(`The channel for the following feed(s):\n\n${summary.join('\n')}\n\nhave been successfully moved to <#${selected.id}>`)
  callback(null, data)
}

module.exports = (bot, message, command) => {
  const feedSelector = new FeedSelector(message, null, { command: command })
  const selectChannel = new MenuUtils.Menu(message, inputChannel, { text: 'Mention the channel to move the feed(s) to.' })

  new MenuUtils.MenuSeries(message, [feedSelector, selectChannel]).start(async (err, data) => {
    try {
      if (err) return err.code === 50013 ? null : await message.channel.send(err.message)
    } catch (err) {
      log.command.warning(`rssmove`, message.guild, err)
    }
  })
}
