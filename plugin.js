'use strict';

const fp = require('fastify-plugin');
const { pathToRegexp } = require('path-to-regexp');
const crypto = require('crypto');
const Redis = require('ioredis');
const { promisify } = require('util');
const read = promisify(require('readall'));
const fetch = require('node-fetch');

const KEY_ABSENT = -1;
const KEY_EXPIRED = 0;
const KEY_EXPIRED_UPDATING = 1;
const KEY_OK = 2;

function paired(route, path) {
  const opts = {
    sensitive: true,
    strict: true,
  };

  return pathToRegexp(route, [], opts).exec(path);
}
const isJsonType = (type = '') => type && type.includes('application/json');
function filterUrl(url, exclude = ['updateCache']) {
  const regexp = (name) => new RegExp(`[\\?&]${name}=([^&#]*)`);
  let result = url;
  exclude.forEach((e) => {
    result = result.replace(regexp(e), '');
  });

  return result;
}
const md5 = (str) => crypto.createHash('md5').update(str).digest('hex');
function generateKeys(prefix, url, excludeRouteQuery) {
  const fUrl = filterUrl(url, excludeRouteQuery);
  const key = `${prefix}${md5(fUrl)}`;

  return ({
    key,
    tkey: `${key}:type`,
    ukey: `${key}:updating`,
    lkey: `${key}:long`,
    ltkey: `${key}:longtype`,
  });
}

async function getCache(options) {
  const {
    request, reply, redisClient, keys, routeExpire,
  } = options;
  const { query: { updateCache = null } } = request;
  if (updateCache) {
    return ({
      result: KEY_ABSENT,
      value: null,
      type: null,
    });
  }

  const {
    key, tkey, ukey, lkey, ltkey,
  } = keys;
  let type = '';
  let typeKey = tkey;
  let result = KEY_ABSENT;
  let isExpiredShortKey = false;
  let value = await redisClient.get(key);

  if (!value) {
    value = await redisClient.get(lkey);
    typeKey = ltkey;
    isExpiredShortKey = true;
  }
  if (value) {
    const isUpdatingCache = await redisClient.exists(ukey);
    type = await redisClient.get(typeKey) || 'text/html';
    if (Buffer.isBuffer(type)) type = type.toString();
    if (isJsonType(type)) value = JSON.parse(value);
    reply.header('X-Cache', isExpiredShortKey ? 'long' : 'short');
    reply.type(type);
    result = KEY_OK;
    if (isExpiredShortKey) {
      if (isUpdatingCache) {
        result = KEY_EXPIRED_UPDATING;
      } else {
        result = KEY_EXPIRED;
        await redisClient.setex(ukey, routeExpire, true);
      }
    }
  }

  return ({
    result,
    value,
    type,
  });
}

async function setCache(opts) {
  const {
    redisClient,
    keys: {
      key,
      tkey,
      lkey,
      ltkey,
    },
    routeExpire,
    prefixExpire,
    payload,
    valueType = '',
  } = opts;
  let valueCache;
  const longRouteExpire = routeExpire * prefixExpire;

  if (Buffer.isBuffer(payload) || (typeof payload === 'string')) {
    valueCache = payload;
  } else if ((typeof payload === 'object') && (isJsonType(valueType))) {
    valueCache = JSON.stringify(payload);
  } else if (typeof payload.pipe === 'function') {
    valueCache = await read(payload);
  } else {
    return null;
  }

  await redisClient.setex(key, routeExpire, valueCache);
  await redisClient.setex(lkey, longRouteExpire, valueCache);
  if (valueType) {
    await redisClient.setex(tkey, routeExpire, valueType);
    await redisClient.setex(ltkey, longRouteExpire, valueType);
  }

  return null;
}

function fastifyCachePlugin(instance, options, next) {
  let redisAvailable = false;
  const {
    prefix = 'redis-cache',
    routes = [{
      path: '(.*)',
      expire: 30,
    }],
    exclude = [],
    expire: defaultExpire = 30,
    prefixExpire = 2,
	  protocol = 'https',
    redisOpts = {
      host: 'localhost',
      port: 6379,
    },
    onError = (err) => console.err('Redis error happened:', err),
  } = { ...options };
  const redisClient = new Redis(redisOpts);

  redisClient.on('error', (err) => {
    redisAvailable = false;
    onError(err);
  });
  redisClient.on('end', () => {
    redisAvailable = false;
  });
  redisClient.on('ready', () => {
    redisAvailable = true;
  });

  instance.addHook('preHandler', async (request, reply) => {
    let ok = KEY_ABSENT;
    let routeExpire = 30;
    const path = request.headers[':path'] || request.raw.url;
    const {
      method,
      url,
      hostname,
    } = request;
    if (!redisAvailable || method.toUpperCase() !== 'GET') {
      reply.isNeedSetCache = false;
      return;
    }

    let match = false;
    const excludeRouteQuery = ['updateCache'];
    const fullUrl = `${protocol}://${hostname}${url}`;

    for (let i = 0; i < routes.length; i += 1) {
      const { path: routePath, expire = defaultExpire } = { ...routes[i] };
      routeExpire = expire;

      if (paired(routePath, path)) {
        match = true;
        break;
      }
    }

    for (let j = 0; j < exclude.length; j += 1) {
      if (paired(exclude[j], path)) {
        match = false;
        break;
      }
    }

    if (!match) {
      reply.isNeedSetCache = false;
      return;
    }

    const keys = generateKeys(prefix, url, excludeRouteQuery);
    reply.keys = keys;
    reply.routeExpire = routeExpire;
    let body;
    let valueType;

    try {
      const { result, value, type } = await getCache({
        request, reply, redisClient, keys, routeExpire,
      });
      ok = result;
      body = value;
      valueType = type;
    } catch (e) {
      reply.isNeedSetCache = true;
      ok = KEY_ABSENT;
    }

    switch (ok) {
      case KEY_OK:
      case KEY_EXPIRED_UPDATING: {
        reply.isNeedSetCache = false;

        return reply.type(valueType).send(body);
      }
      case KEY_EXPIRED: {
        const reqUrl = `${fullUrl}${fullUrl.includes('?') ? '&' : '?'}updateCache=1`;
        const fetch1 = fetch(reqUrl);
        reply.isNeedSetCache = false;

        return reply.type(valueType).send(body);
      }
      case KEY_ABSENT:
      default: {
        reply.isNeedSetCache = true;
        break;
      }
    }
  });

  instance.addHook('onSend', async (request, reply, payload) => {
    const valueType = reply.getHeader('content-type');
    const {
      isNeedSetCache,
      keys,
      routeExpire,
    } = reply;

    if (!isNeedSetCache) return payload;

    try {
      await setCache({
        redisClient,
        keys,
        routeExpire,
        prefixExpire,
        payload,
        valueType,
      });
      await redisClient.del(keys.ukey);
    } catch (err) {
      onError(err);
    }
      return payload;
    });

  next();
}

module.exports = fp(fastifyCachePlugin, {
  fastify: '^3.0.0',
  name: 'fastify-cache-plugin',
});
