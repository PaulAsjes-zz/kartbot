# kartbot

> Slack bot for Mario Kart tournaments


## Install

```
$ npm install --save kartbot
```


## Usage

```js
const kartbot = require('kartbot');

kartbot({
  token: YOUR_TOKEN_HERE, // Add a bot at https://my.slack.com/services/new/bot and copy the token here.
  autoReconnect: true, // Automatically reconnect after an error response from Slack.
  autoMark: true // Automatically mark each message as read after it is processed.
});
```

## License

MIT © [Paul Asjes](http://sols.co)
