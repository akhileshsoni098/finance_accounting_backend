const Payment = require("../models/payment");

async function create(data, options = {}) {
    const [doc] = await Payment.create([data], options);
    return doc;
}

module.exports = { create };