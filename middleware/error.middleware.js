const { HttpError } = require("../utils/http-error");

function errorMiddleware(err, req, res, next) {
    if (err.code === 11000) {
        const field = Object.keys(err.keyPattern || {})[0] || "field";
        return res.status(409).json({
            error: { code: "DUPLICATE_KEY", message: `${field} already exists` },
        });
    }

    if (err instanceof HttpError) {
        return res
            .status(err.status)
            .json({ error: { code: err.code, message: err.message } });
    }

    if (err.name === "ValidationError") {
        const message = Object.values(err.errors).map((e) => e.message).join(", ");
        return res.status(400).json({ error: { code: "VALIDATION_ERROR", message } });
    }

    if (err.name === "CastError") {
        return res
            .status(400)
            .json({ error: { code: "INVALID_INPUT", message: "Invalid id format" } });
    }

    if (err.name === "JsonWebTokenError" || err.name === "TokenExpiredError") {
        return res
            .status(401)
            .json({ error: { code: "UNAUTHORIZED", message: "Invalid or expired token" } });
    }

    console.error(err);
    return res
        .status(500)
        .json({ error: { code: "INTERNAL_ERROR", message: "Internal server error" } });
}

module.exports = errorMiddleware;