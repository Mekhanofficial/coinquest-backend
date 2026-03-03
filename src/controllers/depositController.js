import crypto from "crypto";
import Deposit from "../models/Deposit.js";
import Transaction from "../models/Transaction.js";
import { depositMethods } from "../config/depositMethods.js";
import { asyncHandler } from "../utils/asyncHandler.js";

const findMethod = (paymentMethod) => {
  if (!paymentMethod) return null;
  const key = paymentMethod.toLowerCase();
  return (
    depositMethods.find((method) => method.id === key) ||
    depositMethods.find(
      (method) => method.currencyCode.toLowerCase() === key
    )
  );
};

const generateWalletAddress = (method) => {
  if (method.walletAddress) return method.walletAddress;
  const suffix = crypto.randomBytes(6).toString("hex");
  return `CQ-${method.currencyCode}-${suffix}`;
};

export const listMethods = asyncHandler(async (req, res) => {
  const data = depositMethods.map((method) => ({
    ...method,
    walletAddress: method.walletAddress || `CQ-${method.currencyCode}-WALLET`,
  }));
  res.json({ success: true, data });
});

export const createDeposit = asyncHandler(async (req, res) => {
  const amount = Number(req.body.amount);
  const paymentMethod = req.body.paymentMethod;
  const requestId = req.headers["x-request-id"] || "";

  if (!amount || Number.isNaN(amount) || amount < 10) {
    return res.status(400).json({
      success: false,
      message: "Minimum deposit amount is $10",
    });
  }

  const method = findMethod(paymentMethod);
  if (!method) {
    return res.status(400).json({
      success: false,
      message: "Unsupported deposit method",
    });
  }

  if (requestId) {
    const existing = await Deposit.findOne({
      user: req.user._id,
      requestId,
      status: "Pending",
    });
    if (existing) {
      return res.json({
        success: true,
        data: {
          id: existing._id.toString(),
          walletAddress: existing.walletAddress,
          amount: existing.amount,
          status: existing.status,
        },
      });
    }
  }

  const currency = req.body.currency || req.user?.currencyCode || "USD";
  const walletAddress = generateWalletAddress(method);

  const transaction = await Transaction.create({
    user: req.user._id,
    type: "Deposit",
    amount,
    currency,
    paymentMethod: method.currencyCode,
    status: "Pending",
    walletAddress,
    network: method.network,
    details: `${method.currencyName} deposit`,
  });

  const deposit = await Deposit.create({
    user: req.user._id,
    amount,
    currency,
    paymentMethod: method.id,
    walletAddress,
    network: method.network,
    status: "Pending",
    requestId,
    transaction: transaction._id,
  });

  res.status(201).json({
    success: true,
    data: {
      id: deposit._id.toString(),
      walletAddress: deposit.walletAddress,
      amount: deposit.amount,
      status: deposit.status,
      paymentMethod: deposit.paymentMethod,
      network: deposit.network,
    },
  });
});
