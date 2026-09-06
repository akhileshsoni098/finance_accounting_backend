const mongoose = require("mongoose");

const { HttpError } = require("../../../utils/http-error");

function validateObjectId(value, label) {
    if (!mongoose.isValidObjectId(value)) {
        throw new HttpError(400, "INVALID_INPUT", `${label} must be a valid ObjectId`);
    }
}

module.exports = { validateObjectId };