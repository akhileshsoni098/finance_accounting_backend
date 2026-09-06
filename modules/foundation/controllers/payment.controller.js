const paymentService = require("../services/payment.service");
const subscriptionService = require("../services/subscription.service");
const { validatePaymentPayload } = require("../validators/payment.validator");

async function paySubscription(req, res, next) {
    try {
        const data = validatePaymentPayload(req.body);
        const result = await paymentService.collectDummyPayment({
            tenantId: req.auth.tenantId,
            subscriptionId: data.subscriptionId,
            planKey: data.planKey,
        });
        res.status(201).json({
            payment: paymentService.toPublicPayment(result.payment),
            subscription: subscriptionService.toPublic(result.subscription),
        });
    } catch (error) {
        next(error);
    }
}

module.exports = { paySubscription };