var kartbot = require('./index.js');

kartbot({
  token: process.env.TOKEN,
  autoReconnect: true,
  autoMark: true
});
