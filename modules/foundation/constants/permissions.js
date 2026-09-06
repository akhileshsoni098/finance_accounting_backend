const PERMISSION_CATALOG = [
    { module: "roles", actions: ["create", "read", "update", "delete"] },
    { module: "users", actions: ["create", "read", "update", "delete", "invite"] },
    { module: "tenants", actions: ["read", "update"] },
    { module: "subscriptions", actions: ["read", "update"] },
    { module: "accounting", actions: ["create", "read", "update", "delete", "post", "approve"] },
    { module: "insurance", actions: ["create", "read", "update", "delete"] },
];

function isKnownModule(moduleName) {
    return moduleName === "*" || PERMISSION_CATALOG.some((entry) => entry.module === moduleName);
}

function isKnownAction(moduleName, action) {
    if (action === "*") return true;
    if (moduleName === "*") return true;
    const entry = PERMISSION_CATALOG.find((e) => e.module === moduleName);
    return Boolean(entry && entry.actions.includes(action));
}

module.exports = { PERMISSION_CATALOG, isKnownModule, isKnownAction };