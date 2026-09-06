const mongoose = require("mongoose");

const { HttpError } = require("../../../utils/http-error");

function validatePaymentPayload(body) {
    const errors = [];

    if (!mongoose.isValidObjectId(body.subscriptionId)) {
        errors.push("subscriptionId must be a valid ObjectId");
    }

    if (!body.planKey || typeof body.planKey !== "string" || !/^[a-z][a-z0-9_]*$/.test(body.planKey)) {
        errors.push("planKey must match ^[a-z][a-z0-9_]*$");
    }

    const card = body.card || {};
    if (!card.cardholderName || typeof card.cardholderName !== "string" || card.cardholderName.trim().length < 2) {
        errors.push("card.cardholderName is required");
    }

    const cardNumber = String(card.cardNumber || "").replace(/\s+/g, "");
    if (!/^\d{13,19}$/.test(cardNumber)) {
        errors.push("card.cardNumber must be 13–19 digits");
    }

    if (!/^(0[1-9]|1[0-2])\/\d{2}$/.test(String(card.expiry || ""))) {
        errors.push("card.expiry must be in MM/YY format");
    }

    if (!/^\d{3,4}$/.test(String(card.cvv || ""))) {
        errors.push("card.cvv must be 3–4 digits");
    }

    if (errors.length) {
        throw new HttpError(400, "INVALID_INPUT", errors.join("; "));
    }

    return {
        subscriptionId: body.subscriptionId,
        planKey: body.planKey,
        card: {
            cardholderName: card.cardholderName.trim(),
            cardNumber,
            expiry: card.expiry,
            cvv: card.cvv,
        },
    };
}

module.exports = { validatePaymentPayload };