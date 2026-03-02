import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import Transaction from "../models/Transaction.js";
import Deposit from "../models/Deposit.js";
import Withdrawal from "../models/Withdrawal.js";
import Kyc from "../models/Kyc.js";
import Trade from "../models/Trade.js";
import User from "../models/User.js";
import { env } from "../config/env.js";
import { asyncHandler } from "../utils/asyncHandler.js";

const normalizeStatus = (value) => {
  if (value === undefined || value === null) return null;
  if (typeof value === "number") {
    switch (value) {
      case 1:
        return "Pending";
      case 2:
        return "Completed";
      case 3:
        return "Failed";
      case 4:
        return "Cancelled";
      default:
        return null;
    }
  }

  const normalized = `${value}`.trim().toLowerCase();
  if (["pending", "completed", "failed", "cancelled"].includes(normalized)) {
    return normalized.charAt(0).toUpperCase() + normalized.slice(1);
  }

  return null;
};

export const updateTransactionStatus = asyncHandler(async (req, res) => {
  const { transactionId, newStatus } = req.body;
  if (!transactionId) {
    return res.status(400).json({
      success: false,
      message: "transactionId is required",
    });
  }

  const normalizedStatus = normalizeStatus(newStatus);
  if (!normalizedStatus) {
    return res.status(400).json({
      success: false,
      message: "Invalid status value",
    });
  }

  const transaction = await Transaction.findById(transactionId);
  if (!transaction) {
    return res.status(404).json({
      success: false,
      message: "Transaction not found",
    });
  }

  const previousStatus = transaction.status;
  transaction.status = normalizedStatus;
  await transaction.save();

  const user = await User.findById(transaction.user);
  if (!user) {
    return res.status(404).json({
      success: false,
      message: "User not found",
    });
  }

  if (transaction.type === "Deposit") {
    const deposit = await Deposit.findOne({ transaction: transaction._id });
    if (deposit) {
      deposit.status = normalizedStatus;
      await deposit.save();
    }

    if (normalizedStatus === "Completed" && previousStatus !== "Completed") {
      user.balance = Math.max(0, user.balance + transaction.amount);
      await user.save();
    }
  }

  if (transaction.type === "Withdrawal") {
    const withdrawal = await Withdrawal.findOne({
      transaction: transaction._id,
    });
    if (withdrawal) {
      withdrawal.status = normalizedStatus;
      await withdrawal.save();
    }

    const isRefundStatus =
      normalizedStatus === "Failed" || normalizedStatus === "Cancelled";
    const wasRefundStatus =
      previousStatus === "Failed" || previousStatus === "Cancelled";

    if (isRefundStatus && !wasRefundStatus) {
      user.balance = Math.max(0, user.balance + transaction.amount);
      await user.save();
    }
  }

  res.json({
    success: true,
    data: {
      id: transaction._id.toString(),
      status: transaction.status,
    },
  });
});

export const updateKycStatus = asyncHandler(async (req, res) => {
  const { userId, status } = req.body;
  if (!userId || !status) {
    return res.status(400).json({
      success: false,
      message: "userId and status are required",
    });
  }

  const normalized = `${status}`.toLowerCase();
  if (!["pending", "verified", "rejected"].includes(normalized)) {
    return res.status(400).json({
      success: false,
      message: "Invalid KYC status",
    });
  }

  const user = await User.findById(userId);
  if (!user) {
    return res.status(404).json({
      success: false,
      message: "User not found",
    });
  }

  user.kycStatus = normalized;
  user.kycVerified = normalized === "verified";
  await user.save();

  await Kyc.findOneAndUpdate(
    { user: user._id },
    { status: normalized },
    { new: true }
  );

  res.json({
    success: true,
    data: {
      userId: user._id.toString(),
      kycStatus: user.kycStatus,
      kycVerified: user.kycVerified,
    },
  });
});

const buildAdminToken = (user) =>
  jwt.sign(
    {
      sub: user._id.toString(),
      userId: user._id.toString(),
      uid: user._id.toString(),
      email: user.email,
      role: user.role,
    },
    env.JWT_SECRET,
    { expiresIn: "7d" }
  );

export const registerAdmin = asyncHandler(async (req, res) => {
  const { email, password, authCode, firstName, lastName } = req.body;

  if (!email || !password || !authCode) {
    return res.status(400).json({
      success: false,
      message: "Email, password, and admin code are required",
    });
  }

  if (env.ADMIN_AUTH_CODE && authCode !== env.ADMIN_AUTH_CODE) {
    return res.status(403).json({
      success: false,
      message: "Invalid admin authorization code",
    });
  }

  const normalizedEmail = email.toLowerCase().trim();
  const existing = await User.findOne({ email: normalizedEmail });
  if (existing) {
    return res.status(409).json({
      success: false,
      message: "Email already registered",
    });
  }

  const passwordHash = await bcrypt.hash(password, 10);
  const user = await User.create({
    firstName: (firstName || "Admin").trim(),
    lastName: (lastName || "User").trim(),
    email: normalizedEmail,
    passwordHash,
    role: "admin",
    status: "active",
    subscriptionPlan: "Admin",
  });

  const token = buildAdminToken(user);

  res.status(201).json({
    success: true,
    token,
    data: {
      id: user._id.toString(),
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      role: user.role,
      token,
    },
  });
});

export const listUsers = asyncHandler(async (req, res) => {
  const users = await User.find().sort({ createdAt: -1 });

  const [depositAgg, withdrawalAgg, profitAgg] = await Promise.all([
    Transaction.aggregate([
      { $match: { type: "Deposit", status: "Completed" } },
      { $group: { _id: "$user", total: { $sum: "$amount" } } },
    ]),
    Transaction.aggregate([
      { $match: { type: "Withdrawal", status: "Completed" } },
      { $group: { _id: "$user", total: { $sum: "$amount" } } },
    ]),
    Trade.aggregate([
      { $match: { status: "Completed" } },
      { $group: { _id: "$user", total: { $sum: "$profitLoss" } } },
    ]),
  ]);

  const depositMap = Object.fromEntries(
    depositAgg.map((item) => [item._id.toString(), item.total])
  );
  const withdrawalMap = Object.fromEntries(
    withdrawalAgg.map((item) => [item._id.toString(), item.total])
  );
  const profitMap = Object.fromEntries(
    profitAgg.map((item) => [item._id.toString(), item.total])
  );

  const data = users.map((user) => ({
    id: user._id.toString(),
    firstName: user.firstName,
    lastName: user.lastName,
    email: user.email,
    phoneNumber: user.phoneNumber,
    status: user.status,
    balance: Number(user.balance) || 0,
    transactionCode: user.transactionCode || "",
    totalDeposit: depositMap[user._id.toString()] || 0,
    totalWithdrawal: withdrawalMap[user._id.toString()] || 0,
    profit: profitMap[user._id.toString()] || 0,
  }));

  res.json({ success: true, data });
});

export const updateUserStatus = asyncHandler(async (req, res) => {
  const { status } = req.body;
  if (!status) {
    return res.status(400).json({
      success: false,
      message: "Status is required",
    });
  }

  const normalized = `${status}`.toLowerCase();
  if (!["active", "suspended"].includes(normalized)) {
    return res.status(400).json({
      success: false,
      message: "Invalid status",
    });
  }

  const user = await User.findByIdAndUpdate(
    req.params.id,
    { status: normalized },
    { new: true }
  );

  if (!user) {
    return res.status(404).json({
      success: false,
      message: "User not found",
    });
  }

  res.json({
    success: true,
    data: { id: user._id.toString(), status: user.status },
  });
});

export const deleteUser = asyncHandler(async (req, res) => {
  const user = await User.findByIdAndDelete(req.params.id);
  if (!user) {
    return res.status(404).json({
      success: false,
      message: "User not found",
    });
  }

  res.json({ success: true, data: { id: user._id.toString() } });
});

export const adjustUserBalance = asyncHandler(async (req, res) => {
  const { userId, amount, operation, note } = req.body;

  if (!userId) {
    return res.status(400).json({
      success: false,
      message: "userId is required",
    });
  }

  const normalizedOperation = `${operation || ""}`.trim().toLowerCase();
  if (!["increase", "deduct"].includes(normalizedOperation)) {
    return res.status(400).json({
      success: false,
      message: "operation must be either 'increase' or 'deduct'",
    });
  }

  const amountValue = Number(amount);
  if (!Number.isFinite(amountValue) || amountValue <= 0) {
    return res.status(400).json({
      success: false,
      message: "amount must be a positive number",
    });
  }

  const user = await User.findById(userId);
  if (!user) {
    return res.status(404).json({
      success: false,
      message: "User not found",
    });
  }

  const currentBalance = Number(user.balance) || 0;
  const signedDelta =
    normalizedOperation === "deduct" ? -amountValue : amountValue;
  const nextBalance = currentBalance + signedDelta;

  if (nextBalance < 0) {
    return res.status(400).json({
      success: false,
      message: "Insufficient balance for deduction",
    });
  }

  user.balance = nextBalance;
  await user.save();

  res.json({
    success: true,
    data: {
      userId: user._id.toString(),
      operation: normalizedOperation,
      amount: amountValue,
      delta: signedDelta,
      previousBalance: currentBalance,
      balance: user.balance,
      note: `${note || ""}`.trim(),
      updatedBy: req.user?._id?.toString() || "",
    },
  });
});

export const listKycSubmissions = asyncHandler(async (req, res) => {
  const submissions = await Kyc.find()
    .populate("user")
    .sort({ createdAt: -1 });

  const data = submissions.map((item) => ({
    id: item._id.toString(),
    userId: item.user?._id?.toString() || item.user?.toString(),
    email: item.email || item.user?.email || "",
    name: item.user
      ? `${item.user.firstName || ""} ${item.user.lastName || ""}`.trim()
      : "",
    status: item.status,
    governmentId: item.governmentId,
    selfie: item.selfie,
    submittedAt: item.submittedAt || item.createdAt,
  }));

  res.json({ success: true, data });
});

export const listTransactions = asyncHandler(async (req, res) => {
  const transactions = await Transaction.find()
    .populate("user")
    .sort({ createdAt: -1 });

  const data = transactions.map((tx) => ({
    id: tx._id.toString(),
    type: tx.type,
    amount: tx.amount,
    currency: tx.currency,
    paymentMethod: tx.paymentMethod,
    status: tx.status,
    createdAt: tx.createdAt,
    walletAddress: tx.walletAddress,
    network: tx.network,
    details: tx.details,
    userId: tx.user?._id?.toString() || tx.user?.toString(),
    userName: tx.user
      ? `${tx.user.firstName || ""} ${tx.user.lastName || ""}`.trim()
      : "",
    userEmail: tx.user?.email || "",
  }));

  res.json({ success: true, data });
});
