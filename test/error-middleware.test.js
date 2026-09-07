const { test } = require("node:test");
const assert = require("node:assert/strict");

const errorMiddleware = require("../middleware/error.middleware");

function capture() {
    const calls = [];
    return {
        calls,
        res: {
            status(code) {
                calls.push({ kind: "status", code });
                return this;
            },
            json(payload) {
                calls.push({ kind: "json", payload });
                return this;
            },
        },
    };
}

test("CastError maps to 400 INVALID_INPUT", () => {
    const err = new Error("Cast to ObjectId failed");
    err.name = "CastError";

    const { res, calls } = capture();
    errorMiddleware(err, {}, res, () => {});

    assert.equal(calls[0].code, 400);
    assert.equal(calls[1].payload.error.code, "INVALID_INPUT");
});

test("duplicate key maps to 409 DUPLICATE_KEY", () => {
    const err = new Error("dup");
    err.code = 11000;
    err.keyPattern = { email: 1 };

    const { res, calls } = capture();
    errorMiddleware(err, {}, res, () => {});

    assert.equal(calls[0].code, 409);
    assert.equal(calls[1].payload.error.code, "DUPLICATE_KEY");
});

test("unknown error maps to 500 INTERNAL_ERROR", () => {
    const { res, calls } = capture();
    errorMiddleware(new Error("boom"), {}, res, () => {});

    assert.equal(calls[0].code, 500);
    assert.equal(calls[1].payload.error.code, "INTERNAL_ERROR");
});