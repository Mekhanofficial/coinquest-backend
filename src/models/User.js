import mongoose from "mongoose";

const userSchema = new mongoose.Schema(
  {
    firstName: { type: String, required: true, trim: true },
    lastName: { type: String, required: true, trim: true },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    passwordHash: { type: String, required: true },
    phoneNumber: { type: String, default: "" },
    country: { type: String, default: "" },
    sex: { type: String, default: "" },
    currencyCode: { type: String, default: "USD" },
    currencySymbol: { type: String, default: "$" },
    photoURL: { type: String, default: "" },
    balance: { type: Number, default: 0 },
    role: { type: String, enum: ["user", "admin"], default: "user" },
    status: { type: String, enum: ["active", "suspended"], default: "active" },
    transactionCode: { type: String, default: "" },
    kycStatus: {
      type: String,
      enum: ["not_verified", "pending", "verified", "rejected"],
      default: "not_verified",
    },
    kycVerified: { type: Boolean, default: false },
    subscriptionPlan: { type: String, default: "Basic" },
    referralCode: { type: String, unique: true, sparse: true },
    referredBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    resetTokenHash: { type: String, default: "" },
    resetTokenExpires: { type: Date },
  },
  { timestamps: true }
);

export default mongoose.model("User", userSchema);
