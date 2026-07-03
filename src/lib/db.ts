import mongoose from "mongoose";
import { validateProductionEnv } from "@/lib/env";

declare global {
  var mongooseCache:
    | {
        conn: typeof mongoose | null;
        promise: Promise<typeof mongoose> | null;
      }
    | undefined;
}

const cache = global.mongooseCache ?? { conn: null, promise: null };
global.mongooseCache = cache;

export async function connectDb() {
  if (cache.conn) return cache.conn;

  const uri = validateProductionEnv().MONGODB_URI;

  cache.promise ??= mongoose.connect(uri, {
    bufferCommands: false,
    dbName: "bacardi-ticket-hub",
  });

  cache.conn = await cache.promise;
  return cache.conn;
}
