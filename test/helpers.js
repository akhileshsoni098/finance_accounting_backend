const mongoose = require("mongoose");

const { mongoUri } = require("../config/env");

const MODELS = require("../modules/foundation/models");

function testMongoUri() {
    const url = new URL(mongoUri);
    const suffix = process.env.TEST_DB_SUFFIX ? `_${process.env.TEST_DB_SUFFIX}` : "";
    url.pathname = `/veridex_finance_test${suffix}`;
    return url.toString();
}

async function connectTestDB() {
    await mongoose.connect(testMongoUri());
    await mongoose.connection.dropDatabase();
    await Promise.all(Object.values(MODELS).map((model) => model.init()));
}

async function disconnectTestDB() {
    try {
        await mongoose.connection.dropDatabase();
    } catch (error) {
        // ignore drop failures during teardown
    }
    await mongoose.disconnect();
}

async function cleanCollections() {
    const collections = Object.values(MODELS);
    await Promise.all(collections.map((model) => model.deleteMany({})));
}

module.exports = { connectTestDB, disconnectTestDB, cleanCollections, testMongoUri };