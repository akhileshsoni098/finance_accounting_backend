const mongoose = require("mongoose");
const { Schema } = require("./common");

const tenantMembershipSchema = new Schema(
  {
    tenantId: { type: Schema.Types.ObjectId, ref: "Tenant", required: true, immutable: true },
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, immutable: true },
    role: { type: String, enum: ["owner", "admin", "accountant", "approver", "viewer"], required: true },
    entityIds: [{ type: Schema.Types.ObjectId, ref: "Entity" }],
    status: { type: String, enum: ["invited", "active", "suspended", "removed"], default: "invited" },
    invitedBy: { type: Schema.Types.ObjectId, ref: "User", immutable: true },
    invitedAt: { type: Date, default: Date.now, immutable: true },
    joinedAt: Date,
  },
  { timestamps: true, strict: "throw" },
);

tenantMembershipSchema.index({ tenantId: 1, userId: 1 }, { unique: true });
tenantMembershipSchema.index({ userId: 1, status: 1 });
tenantMembershipSchema.index({ tenantId: 1, role: 1, status: 1 });

module.exports = mongoose.model("TenantMembership", tenantMembershipSchema);
