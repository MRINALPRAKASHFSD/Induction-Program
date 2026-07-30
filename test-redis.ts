import { getRedis } from './server/redis.js';

async function test() {
  try {
    const redis = getRedis();
    console.log("Redis connected");
  } catch (e) {
    console.error(e);
  }
}
test();
