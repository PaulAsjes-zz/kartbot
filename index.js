'use strict';

var Slack = require('slack-client');

function kartbot(opts) {
  // console.log('bonjour');
  var slackToken = opts.token,
      autoReconnect = opts.autoReconnect || true,
      autoMark = opts.autoMark || true;

  var slack = new Slack(slackToken, autoReconnect, autoMark);

  // pool of players currently playing
  var pool;

  slack.on('open', function() {
    console.log('Connected to ' + slack.team.name + ' as ' + slack.self.name);
    var channels = getChannels(slack.channels);
    console.log('Currently in: ' + channels.join(', '));
  });

  slack.on('message', function(message) {
    var user = slack.getUserByID(message.user),
        channel = slack.getChannelGroupOrDMByID(message.channel);

    if (message.text && message.text.toLowerCase().indexOf('hi kartbot') > -1 && user) {
      channel.send('Hi ' + user.name + '!');
    }

    var members;
    if (channel.members) {
      members = channel.members.map(function(member) {
        return slack.getUserByID(member).name;
      });
    }

    // sometimes the message is an image, so check that there's actual text first
    if (message.text) {
      switch (message.text.toLowerCase()) {
        // challenge other members to a game of kart
        case '!kart':
          pool = challenge(channel, members, user, 'Kart');
          break;

        // challenge other members to game of smash
        case '!smash':
          pool = challenge(channel, members, user, 'Smash');
          break;

        // opt out of playing
        case '!nokart':
          pool = reject(channel, members, user, pool);
          break;

        // show amount of times members have challenged and have been challenged
        case '!score':

          break;

        // send list of commands
        case '!help':
          channel.send('Possible commands are: \n \`!kart\` - Challenge random channel members to Mario Kart \n \`!smash\` - Challenge random channel members to Smash Bros');
          break;
      }
    }
  });

  slack.on('error', function(err) {
    console.log('Error:', err);
  });

  slack.login();
};

function reject(channel, members, user, pool) {
  if (pool.indexOf(user.name) > 0) {
    var newPlayer;
    do {
      newPlayer = members[Math.floor(Math.random() * members.length)];
    } while(pool.indexOf(newPlayer) > -1)

    channel.send(upper(user.name) + ' has dropped out! ' + upper(newPlayer) + ' has been challenged in their place!');

    pool.slice(pool.indexOf(user.name), newPlayer);
  } else {
    channel.send(upper(user.name) + ' has tried to drop out, but they weren\'t invited to play! Jerk!');
  }

  return pool;
}

function challenge(channel, members, user, game) {
  var pool = members.concat();
  // remove kart caller from list
  pool.splice(pool.indexOf(user.name), 1);

  // remove kartbot from list
  pool.splice(pool.indexOf('kartbot'), 1);

  // randomly pick people from pool
  var len = pool.length < 3 ? pool.length : 3;

  while (pool.length > len) {
    var seed = Math.floor(Math.random() * pool.length);
    pool.splice(seed, 1);
  }

  var names = pool.map(upper);
  channel.send(game + ' time! ' + upper(user.name) + ' has challenged ' + names.join(', ') + ' to a game of ' + game + '!');

  // add the original challenger back to the list
  pool.push(user.name);

  return pool;
}

function upper(str) {
  return str.charAt(0).toUpperCase() + str.slice(1);
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
