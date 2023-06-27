import { FastifyPluginCallback } from 'fastify';
import { RedisOptions } from 'ioredis';
import { Path } from 'path-to-regexp';

declare namespace fastifyCache {
  export interface FastifyCachePluginOptions {
    prefix?: string;
    routes?: {
      path: Path;
      expire?: number;
    }[];
    exclude?: Path[];
    expire?: number;
    prefixExpire?: number;
    protocol?: 'http' | 'https';
    redisOpts?: RedisOptions;
    onError?: (err: ErrorEvent) => void;
  }
  export const fastifyCache: fastifyCachePlugin
  export { fastifyCache as default }
}

type fastifyCachePlugin = FastifyPluginCallback<fastifyCache.FastifyCachePluginOptions>

declare function fastifyCache(...params: Parameters<fastifyCachePlugin>): ReturnType<fastifyCachePlugin>;
export = fastifyCache;
