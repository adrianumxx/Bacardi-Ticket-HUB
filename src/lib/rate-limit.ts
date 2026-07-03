import { connectDb } from "@/lib/db";
import { RateLimit } from "@/lib/models";

export type RateLimitResult = { limited: boolean; remaining: number };

/**
 * Persistent, per-key rate limiter backed by MongoDB so limits are shared
 * across serverless instances and survive cold starts. Expired buckets are
 * removed automatically by the TTL index on `expiresAt`.
 *
 * Fails open: if the datastore is unreachable we allow the request rather than
 * locking users out because of an infrastructure hiccup.
 */
export async function rateLimit(key: string, limit: number, windowMs: number): Promise<RateLimitResult> {
  try {
    await connectDb();
    const now = new Date();

    const existing = await RateLimit.findOne({ key }).lean<{ count: number; expiresAt: Date } | null>();
    if (!existing || existing.expiresAt <= now) {
      await RateLimit.findOneAndUpdate(
        { key },
        { $set: { key, count: 1, expiresAt: new Date(now.getTime() + windowMs) } },
        { upsert: true },
      );
      return { limited: false, remaining: limit - 1 };
    }

    const updated = await RateLimit.findOneAndUpdate(
      { key },
      { $inc: { count: 1 } },
      { new: true },
    ).lean<{ count: number } | null>();
    const count = updated?.count ?? existing.count + 1;
    return { limited: count > limit, remaining: Math.max(0, limit - count) };
  } catch (error) {
    console.error("[rate-limit:unavailable]", {
      key,
      message: error instanceof Error ? error.message : String(error),
    });
    return { limited: false, remaining: limit };
  }
}

export function requestIp(request: Request) {
  return (
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    "local"
  );
}
