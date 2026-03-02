import mongoose from "mongoose";

const stakeSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    asset: { type: String, default: "" },
    amount: { type: Number, required: true },
    apy: { type: Number, default: 0 },
    status: {
      type: String,
      enum: ["Active", "Completed", "Cancelled"],
      default: "Active",
    },
    startedAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

export default mongoose.model("Stake", stakeSchema);
