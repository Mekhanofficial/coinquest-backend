import mongoose from "mongoose";

const transactionSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    type: {
      type: String,
      enum: [
        "Deposit",
        "Withdrawal",
        "Trade",
        "CopyTrade",
        "PlaceTrade",
        "RealEstate",
        "Signal",
        "Subscription",
        "Mining",
        "Stake",
        "BuyBot",
      ],
      required: true,
    },
    amount: { type: Number, required: true },
    currency: { type: String, default: "USD" },
    paymentMethod: { type: String, default: "" },
    status: {
      type: String,
      enum: ["Pending", "Completed", "Failed", "Cancelled"],
      default: "Pending",
    },
    walletAddress: { type: String, default: "" },
    network: { type: String, default: "" },
    details: { type: String, default: "" },
    metadata: { type: mongoose.Schema.Types.Mixed, default: {} },
  },
  { timestamps: true }
);

export default mongoose.model("Transaction", transactionSchema);
