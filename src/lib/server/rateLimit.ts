/**
 * In-memory sliding-window rate limiter.
 * Limits are per user+action, reset automatically.
 * Serverless note: each cold-start resets the map, which is acceptable —
 * it means limits are best-effort, not a hard billing gate (credits handle that).
 */

type RateBucket = { timestamps: number[] };

const store = new Map<string, RateBucket>();

// Clean stale entries every 5 minutes
const CLEANUP_INTERVAL = 5 * 60 * 1000;
let lastCleanup = Date.now();

function cleanup(windowMs: number) {
	const now = Date.now();
	if (now - lastCleanup < CLEANUP_INTERVAL) return;
	lastCleanup = now;
	const cutoff = now - windowMs;
	for (const [key, bucket] of store) {
		bucket.timestamps = bucket.timestamps.filter((t) => t > cutoff);
		if (bucket.timestamps.length === 0) store.delete(key);
	}
}

/**
 * Check and consume a rate-limit slot.
 * @returns `{ allowed: true }` or `{ allowed: false, retryAfterMs }`.
 */
export function rateLimit(
	userId: string,
	action: string,
	maxRequests: number,
	windowMs: number
): { allowed: true } | { allowed: false; retryAfterMs: number } {
	cleanup(windowMs);

	const key = `${userId}:${action}`;
	const now = Date.now();
	const cutoff = now - windowMs;

	let bucket = store.get(key);
	if (!bucket) {
		bucket = { timestamps: [] };
		store.set(key, bucket);
	}

	// Remove timestamps outside the window
	bucket.timestamps = bucket.timestamps.filter((t) => t > cutoff);

	if (bucket.timestamps.length >= maxRequests) {
		const oldest = bucket.timestamps[0];
		return { allowed: false, retryAfterMs: oldest + windowMs - now };
	}

	bucket.timestamps.push(now);
	return { allowed: true };
}
