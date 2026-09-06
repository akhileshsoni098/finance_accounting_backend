const mongoose = require("mongoose");

const { mongoUri } = require("../config/env");

const MODELS = require("../modules/foundation/models");

function testMongoUri() {
    const url = new URL(mongoUri);
    url.pathname = "/veridex_finance_test";
    return url.toString();
}

async function connectTestDB() {
    await mongoose.connect(testMongoUri());
    await Promise.all(Object.values(MODELS).map((model) => model.init()));
}

async function disconnectTestDB() {
    await mongoose.disconnect();
}

async function cleanCollections() {
    const collections = Object.values(MODELS);
    await Promise.all(collections.map((model) => model.deleteMany({})));
}

module.exports = { connectTestDB, disconnectTestDB, cleanCollections, testMongoUri };