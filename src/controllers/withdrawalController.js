import Withdrawal from "../models/Withdrawal.js";
import Transaction from "../models/Transaction.js";
import { asyncHandler } from "../utils/asyncHandler.js";

export const createWithdrawal = asyncHandler(async (req, res) => {
  const amount = Number(req.body.amount);
  const currency = req.body.currency || "USD";
  const paymentMethod = req.body.paymentMethod;
  const details = req.body.details || "";
  const destination = req.body.destination || {};

  if (!amount || Number.isNaN(amount) || amount < 10) {
    return res.status(400).json({
      success: false,
      message: "Minimum withdrawal amount is $10",
    });
  }

  if (!paymentMethod) {
    return res.status(400).json({
      success: false,
      message: "Payment method is required",
    });
  }

  if (amount > req.user.balance) {
    return res.status(400).json({
      success: false,
      message: "Insufficient balance",
    });
  }

  const transaction = await Transaction.create({
    user: req.user._id,
    type: "Withdrawal",
    amount,
    currency,
    paymentMethod,
    status: "Pending",
    details,
    metadata: { destination },
  });

  const withdrawal = await Withdrawal.create({
    user: req.user._id,
    amount,
    currency,
    paymentMethod,
    details,
    destination,
    status: "Pending",
    transaction: transaction._id,
  });

  req.user.balance = Math.max(0, req.user.balance - amount);
  await req.user.save();

  res.status(201).json({
    success: true,
    data: {
      id: withdrawal._id.toString(),
      status: withdrawal.status,
    },
  });
});
