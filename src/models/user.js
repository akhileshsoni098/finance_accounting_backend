const mongoose = require("mongoose");
const { Schema } = require("./common");

const userSchema = new Schema(
  {
    email: { type: String, required: true, trim: true, lowercase: true, maxlength: 254 },
    displayName: { type: String, required: true, trim: true, maxlength: 160 },
    passwordHash: { type: String, select: false },
    externalIdentityId: { type: String, trim: true, maxlength: 200 },
    status: { type: String, enum: ["invited", "active", "suspended", "disabled"], default: "invited" },
    mfa: {
      enabled: { type: Boolean, default: false },
      method: { type: String, enum: ["totp", "webauthn", "external"] },
      verifiedAt: Date,
    },
    lastLoginAt: Date,
  },
  { timestamps: true, strict: "throw" },
);

userSchema.index({ email: 1 }, { unique: true });
userSchema.index({ externalIdentityId: 1 }, { unique: true, sparse: true });

module.exports = mongoose.model("User", userSchema);
