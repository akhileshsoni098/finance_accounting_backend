const mongoose = require("mongoose");

const { mongoUri } = require("./env");

async function connectDB() {
    await mongoose.connect(mongoUri);
    return mongoose.connection;
}

module.exports = { connectDB };