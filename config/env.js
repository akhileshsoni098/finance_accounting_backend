require("dotenv").config();

const required = ["MONGO_URI", "JWT_ACCESS_SECRET"];

for (const key of required) {
    if (!process.env[key]) {
        throw new Error(`Missing required environment variable: ${key}`);
    }
}

module.exports = {
    env: process.env.NODE_ENV || "development",
    port: Number(process.env.PORT) || 3000,
    mongoUri: process.env.MONGO_URI,
    jwtAccessSecret: process.env.JWT_ACCESS_SECRET,
    jwtExpiresIn: process.env.JWT_EXPIRES_IN || "8h",
    clientOrigin:
        process.env.CLIENT_ORIGIN || "http://localhost:5173,http://127.0.0.1:5173",
    clientOrigins: (process.env.CLIENT_ORIGIN || "http://localhost:5173,http://127.0.0.1:5173")
        .split(",")
        .map((origin) => origin.trim())
        .filter(Boolean),
    bcryptRounds: Number(process.env.BCRYPT_ROUNDS) || 10,
};