# fastify-redis-cache
A Fastify plugin for caching responses using redis and two ttl keys (caching only GET requests).

![Cache schema](assets/schema.jpeg?raw=true)

Under the hood [ioredis](https://github.com/luin/ioredis) is used as client, the ``options`` that you pass to `redisOpts` will be passed to the Redis client.

## Install
```
yarn add fastify-cache-plugin
```

## Usage
```js
'use strict';

const server = require('fastify')({
  logger: true,
  maxParamLength: 200,
});
const options = {
  routes: [{
    path: '(.*)',
    expire: 30,
  }],
  redisOpts: {
    host: '127.0.0.1',
    port: 6379,
  },
};
server.register(require('fastify-redis-cache'), options);

server.listen(3000, (err, address) => {
  if (err) {
    server.log.error(err);
    throw err;
  }
  server.log.info(`Server listening on ${address}`);
});
```
Plugin sets an X-Cache custom header with a value (short or long) that determines where the cache comes from.

## Options
### 📌 prefix
* type: `String`
* description: prefix for redis key
* default: `'redis-cache'`
### 📌 routes
* type: `Array`
* description: array of caching routes
* example: `[ { path: '/api/game', expire: 40 }, { path: '/api/team:id' } ]`.
If the route parameter `expire` is not specified, the default value (`30 seconds`) will be taken. Possible path [see here](https://github.com/pillarjs/path-to-regexp)
* default: `[{ path: '(.*)', expire: 30 }]`
### 📌 exclude
* type: `Array`
* description: array of exclude routes
* example: `['/api/livezone/(.*)', '/health-check']`. Possible path [see here](https://github.com/pillarjs/path-to-regexp)
* default: `[]`
### 📌 expire
* type: `Number`
* description: redis ttl in seconds
* default: `30`
### 📌 prefixExpire
* type: `Number`
* description: expire prefix for second redis key
* default: `2`
### 📌 protocol
* type: `String`
* description: protocol where your server live
* default: `https`
### 📌 redisOpts
* type: `Object`
* description: redis options. See details [[options] here](https://github.com/luin/ioredis/blob/master/API.md)
* default: `{ host: 'localhost', port: 6379 }`
### 📌 onError
* type: `Function`
* description: callback function for errors
* default: `(err) => console.err('Redis error happened:', err)`

## 🗓️ Future plans
* [ ] Update to version 4
* [ ] Write tests
* [ ] TypeScript
