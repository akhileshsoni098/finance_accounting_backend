const planService = require("../services/plan.service");

async function listPlans(req, res, next) {
    try {
        const plans = await planService.listPlans();
        res.json({ plans: plans.map(planService.toPublic) });
    } catch (error) {
        next(error);
    }
}

module.exports = { listPlans };