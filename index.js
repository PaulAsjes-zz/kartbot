'use strict';

const Slack = require('slack-client');
var redis = require('redis');

const Teams = require('./teams.json');
var maxPlayers;

function kartbot(opts) {
  var slackToken = opts.token,
      autoReconnect = opts.autoReconnect || true,
      autoMark = opts.autoMark || true;

  // max players for mario kart is 4, but perhaps we want to use this for other games (like smash?)
  maxPlayers = opts.maxPlayers || 4;

  var slack = new Slack(slackToken, autoReconnect, autoMark);

  var redisClient = redis.createClient();

  // pool of players currently playing
  var pool = [];

  slack.on('open', function() {
    console.log(`Connected to ${slack.team.name} as ${slack.self.name}`);
    var channels = getChannels(slack.channels);
    console.log(`Currently in: ${channels.join(', ')}`);
  });

  slack.on('message', function(message) {
    var user = slack.getUserByID(message.user),
        channel = slack.getChannelGroupOrDMByID(message.channel);

    if (user && user.is_bot) {
      return;
    }

    var members;
    if (channel.members) {
      members = channel.members.filter(function(member) {
        let m = slack.getUserByID(member);
        return (m.presence === 'active' && !m.is_bot);
      })
      .map(function(member) {
        return slack.getUserByID(member).name;
      });
    }

    // sometimes the message is an image, so check that there's actual text first
    if (message.text) {
      var msg = message.text.toLowerCase();
      var args = msg.split(' ');

      switch (true) {
        // say hi!
        case (msg.indexOf('hi kartbot') > -1) || msg.indexOf('hi fifabot') > -1:
          var responses = [
            ', why aren\'t you playing right now?',
            ', good time to kart!',
            ', you look nice today!',
            ', it\'s a good day for some trash talk!',
            ', go play some FIFA!',
            ', there appears to be a severe lack of gaming in this channel.',
            ', what\'s your favourite game on the Wii and why is it Mario Kart?'
          ];

          var res = responses[Math.floor(Math.random() * responses.length)];

          channel.send(`Hi ${upper(user.name)}${res}`);

          break;

        // challenge other members to a game of kart
        case (args[0] === '!kart'):
          pool = challenge(channel, members, user, args, 'Kart');
          break;

        case (args[0] === '!fifa'):
          pool = challenge(channel, members, user, args, 'Fifa');
          break;

        // challenge other members to game of smash
        case (args[0] === '!smash'):
          pool = challenge(channel, members, user, args, 'Smash');
          break;

        // opt out of playing
        case (args[0] === '!nokart' || args[0] === '!nofifa'):
          pool = reject(channel, members, user, pool);
          break;

        // show amount of times members have challenged and have been challenged
        case (args[0] === '!stats'):
          getStats(redisClient, user, channel, args)
          break;

        // join the game in progress
        case (args[0] === '!join'):
          pool = join(channel, user, pool);
          break;

        case (args[0] === '!list'):
          list(channel, pool);
          break;

        // roll the dice against someone else
        case (args[0] === '!roll'):
          roll(args, user, channel, members, redisClient);
          break;

        // send list of commands
        case (msg.indexOf('!help') > -1):
          channel.send(`Hi ${upper(user.name)}! Possible commands are:`);
          channel.send(`> \`!kart\` - Challenge random channel members to Mario Kart`);
          channel.send(`> \`!fifa\` - Challenge random channel members to Fifa with random teams`);
          channel.send(`> \`!smash\` - Challenge random channel members to Smash Bros`);
          channel.send(`> \`!nokart\` - Reject the kart challenge :(`);
          channel.send(`> \`!nofifa\` - Reject the fifa challenge :(`);
          channel.send(`> \`!list\` - See who's currently challenged`);
          channel.send(`> \`!roll USER\` - Challenge someone in the channel to a game of chance`);
          break;
      }
    }
  });

  slack.on('error', function(err) {
    console.log('Error:', err);
  });

  slack.login();
};

function getStats(redisClient, user, channel, args) {
  redisClient.get(`${user.name}_challenges`, function(err, result) {
    channel.send(`${upper(user.name)}'s challenges: ${result}`);
  });

  redisClient.get(`${user.name}_wins`, function(err, result) {
    channel.send(`${user.name}'s wins: ${result}`);
  });
}

function list(channel, pool) {
  if (pool && pool.length > 0) {
    var names = pool.map(upper);
    channel.send(`${names.join(', ')} are currently challenged!`);
  } else {
    channel.send('No challengers have challenged challengees! This makes kartbot sad :(');
  }
}

function join(channel, user, pool) {
  if (pool.length >= maxPlayers) {
    channel.send(`Sorry ${upper(user.name)}, but the game is full! Ask one of these guys if they will give up their place:
      ${pool.map(function(u) {
        return upper(u.name);
      }).join(', ')}`);
    return pool;
  }

  if (pool.indexOf(user.name) > -1) {
    channel.send(`You are already in the game, ${upper(user.name)}!`);
    return pool;
  }

  pool.push(user.name);

  var ret = '';

  if (pool.length < (maxPlayers - 1)) {
    ret = ` Room for ${(maxPlayers - 1) - pool.length} more!`;
  }

  channel.send(`${upper(user.name)} has joined!`);
  list(channel, pool);

  return pool;
}

function roll(args, user, channel, members, redisClient) {
  // if someone tries to PM kartbot
  if (!members) {
    channel.send('No thanks, that seems a bit pointless.');
    return;
  }

  if (members.indexOf(args[1]) > -1) {
    if (args[1] === user.name) {
      channel.send(`${upper(user.name)} tried to roll against themselves. _They lost._`);
      return;
    }

    var firstRoll = Math.round(Math.random() * 100),
        secondRoll = Math.round(Math.random() * 100),
        c = upper(user.name),
        o = upper(args[1]);

    // reroll in the unlikely event that it's a tie
    while (firstRoll === secondRoll) {
      secondRoll = Math.round(Math.random() * 100);
    }

    var winner = firstRoll > secondRoll ? c : o;

    channel.send(`${c} fancies their chances against ${o}!\n${c} rolls: ${firstRoll}\n${o} rolls: ${secondRoll}\n\n*${winner} is the winner!*`);

    var key = `${user.name}_challenges`;

    // set amount of times challenged
    redisClient.get(key, function(err, result) {
      var challenges = parseInt(result || 1, 10) + 1;
      console.log('challenges:', challenges);
      redisClient.set(key, challenges.toString());
    });

    // set amount of times won
    key = `${winner}_wins`;
    redisClient.get(key, function(err, result) {
      var wins = parseInt(result || 1, 10) + 1;
      redisClient.set(key, wins.toString());
    });

  } else {
    // stop people from trying !roll without a command
    var joined = args.slice(1).join(' ');
    var res = args.slice(1).length > 1 || joined === '' ? 'that dumb thing you just tried' : joined;
    channel.send(`Sorry ${upper(user.name)}, but ${res} is in another castle.`);
  }
}

function reject(channel, members, user, pool) {
  if (pool.indexOf(user.name) > -1) {
    // if the challenger drops out, cancel the whole thing
    if (pool[pool.length - 1] === user.name) {
      channel.send(upper(`${user.name} dropped out, challenge has been cancelled!`));
      return pool = [];
    }

    // remove original rejecter and kartbot
    members.splice(pool.indexOf(user.name), 1);
    members.splice(pool.indexOf('kartbot'), 1);

    var newPlayer;
    do {
      newPlayer = members[Math.floor(Math.random() * members.length)];
    } while(pool.indexOf(newPlayer) > -1)

    channel.send(`${upper(user.name)} has dropped out! ${upper(newPlayer)} has been challenged in their place!`);

    pool.splice(pool.indexOf(user.name), 1, newPlayer);
    var karters = pool.map(upper);
    channel.send(`Current karters: ${karters.join(', ')}`);
  } else {
    channel.send(`${upper(user.name)} has tried to drop out, but they weren\'t invited to play! Jerk!`);
  }

  return pool;
}

function challenge(channel, members, user, args, game) {
  // if no members, that means you're trying to DM kartbot
  if (!members || args.indexOf('kartbot') > -1) {
    channel.send('Thanks, but I don\'t want to play right now.');
    return [];
  }
  var pool = members.concat();

  for (var i = 1; i < args.length; i++) {
    if (members.indexOf(args[i]) < 0) {
      channel.send(`${upper(user.name)} wants a game of ${game}, but I can\'t find '${args[i]}' in this channel!`);
      return;
    }
  }

  var ret = '',
      hasChallenged = false;

  // use names given
  if (args.slice(1).length > 0) {
    pool = args.slice(1);
    hasChallenged = true;
  }

  // filter out duplicates
  pool = pool.filter(function(item, pos) {
    return pool.indexOf(item) === pos;
  });

  // remove kart caller from list
  if (pool.indexOf(user.name) > -1) {
    pool.splice(pool.indexOf(user.name), 1);
  }

  // remove kartbot from list
  if (pool.indexOf('kartbot') > -1) {
    pool.splice(pool.indexOf('kartbot'), 1);
  }

  if (!hasChallenged) {
    // randomly pick people from pool
    var len = pool.length < (maxPlayers - 1) ? pool.length : maxPlayers - 1;

    while (pool.length > len) {
      var seed = Math.floor(Math.random() * pool.length);
      pool.splice(seed, 1);
    }
  }

  if (pool.length < (maxPlayers - 1)) {
    ret = ` Room for ${(maxPlayers - 1) - pool.length} more!`;
  }

  var names = pool.map(upper);
  channel.send(`${game} time! ${upper(user.name)} has challenged ${names.join(', ')} to a game of ${game}! ${ret}`);

  if (game.indexOf("Fifa") > -1) {

    var teams = getTwoRandomTeams();
    channel.send('The leagues are: ' + teams[0].league + ' and ' + teams[1].league);
    channel.send('The teams are: ' + teams[0].team + ' vs. ' + teams[1].team);
  }

  // add the original challenger back to the list
  pool.push(user.name);

  return pool;
}

function upper(str) {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

function getTwoRandomTeams() {
  var homeLeague, awayLeague, homeTeam, awayTeam;

  homeLeague = Teams.leagues[Math.floor(Math.random() * Teams.leagues.length)];
  awayLeague = Teams.leagues[Math.floor(Math.random() * Teams.leagues.length)];
  homeTeam = homeLeague.teams[Math.floor(Math.random() * homeLeague.teams.length)];
  awayTeam = awayLeague.teams[Math.floor(Math.random() * awayLeague.teams.length)];

  return [{"league": homeLeague.name, "team": homeTeam.name}, {"league": awayLeague.name, "team": awayTeam.name}];
}

function getChannels(allChannels) {
  var channels = [];

  for (var id in allChannels) {
    var channel = allChannels[id];
    if (channel.is_member) {
      channels.push(channel.name);
    }
  }

  return channels;
}

module.exports = kartbot;
