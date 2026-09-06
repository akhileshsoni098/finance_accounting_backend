const mongoose = require("mongoose");

const { Schema } = mongoose;

const permissionSchema = new Schema(
  {
    module: {
      type: String,
      required: true,
      trim: true,
    },

    actions: {
      type: [String],
      default: [],
    },
  },
  { _id: false }
);

const roleSchema = new Schema(
  {
    tenantId: {
      type: Schema.Types.ObjectId,
      ref: "Tenant",
      required: true,
      immutable: true,
      index: true,
    },

    name: {
      type: String,
      required: true,
      trim: true,
      maxlength: 80,
    },

    key: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
      match: /^[a-z][a-z0-9_]*$/,
    },

    permissions: {
      type: [permissionSchema],
      default: [],
    },

    isSystem: {
      type: Boolean,
      default: false,
    },

    status: {
      type: String,
      enum: ["active", "inactive"],
      default: "active",
    },
  },
  { timestamps: true }
);

roleSchema.index(
  { tenantId: 1, key: 1 },
  { unique: true }
);

module.exports = mongoose.model("Role", roleSchema);