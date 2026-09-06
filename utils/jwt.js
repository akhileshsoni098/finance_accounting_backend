const jwt = require("jsonwebtoken");

const { jwtAccessSecret, jwtExpiresIn } = require("../config/env");

function signAccessToken(payload) {
    return jwt.sign(payload, jwtAccessSecret, { expiresIn: jwtExpiresIn });
}

function verifyAccessToken(token) {
    return jwt.verify(token, jwtAccessSecret);
}

module.exports = { signAccessToken, verifyAccessToken };