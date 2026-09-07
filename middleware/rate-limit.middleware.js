const { HttpError } = require("../utils/http-error");

const attempts = new Map();

function keyFor(req) {
    return `${req.ip || req.socket.remoteAddress || "unknown"}`;
}

function sweep() {
    const now = Date.now();
    for (const [key, record] of attempts) {
        if (record.resetAt < now) {
            attempts.delete(key);
        }
    }
}

function createRateLimiter({ windowMs = 15 * 60 * 1000, max = 10 } = {}) {
    return (req, res, next) => {
        const key = keyFor(req);
        const now = Date.now();
        const record = attempts.get(key);

        if (attempts.size > 10000) {
            sweep();
        }

        if (!record || record.resetAt < now) {
            attempts.set(key, { count: 1, resetAt: now + windowMs });
            return next();
        }

        record.count += 1;
        if (record.count > max) {
            return next(new HttpError(429, "RATE_LIMITED", "Too many attempts. Please try again later"));
        }

        return next();
    };
}

module.exports = { createRateLimiter };