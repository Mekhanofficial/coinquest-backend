import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import Transaction from "../models/Transaction.js";
import Deposit from "../models/Deposit.js";
import Withdrawal from "../models/Withdrawal.js";
import Kyc from "../models/Kyc.js";
import Trade from "../models/Trade.js";
import PlaceTrade from "../models/PlaceTrade.js";
import Subscription from "../models/Subscription.js";
import Signal from "../models/Signal.js";
import CopyTrade from "../models/CopyTrade.js";
import BuyBot from "../models/BuyBot.js";
import Mining from "../models/Mining.js";
import Stake from "../models/Stake.js";
import RealEstate from "../models/RealEstate.js";
import Referral from "../models/Referral.js";
import SupportThread from "../models/SupportThread.js";
import AdminEvent from "../models/AdminEvent.js";
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

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

const parseLimit = (value, fallback = 120, min = 20, max = 500) => {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) return fallback;
  return clamp(parsed, min, max);
};

const asNumber = (value) => {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : 0;
};

const asDateMs = (value) => {
  if (!value) return 0;
  const timestamp = new Date(value).getTime();
  return Number.isFinite(timestamp) ? timestamp : 0;
};

const safeTrim = (value) => `${value || ""}`.trim();

const normalizePlanFilter = (value) => {
  if (!value) return [];
  const list = Array.isArray(value) ? value : `${value}`.split(",");
  return list
    .map((item) => `${item || ""}`.trim().toLowerCase())
    .filter(Boolean);
};

const createAdminEvent = async ({
  type,
  message,
  actorId,
  targetUserId = null,
  metadata = {},
}) => {
  if (!type || !message || !actorId) return;

  try {
    await AdminEvent.create({
      type,
      message: safeTrim(message).slice(0, 500),
      actor: actorId,
      targetUser: targetUserId || null,
      metadata,
    });
  } catch (error) {
    console.error("Failed to persist admin event:", error);
  }
};

const toIsoStringOrNull = (value) => {
  const timestamp = asDateMs(value);
  return timestamp ? new Date(timestamp).toISOString() : null;
};

const getUserKey = (id) => {
  if (!id) return "";
  return typeof id === "string" ? id : id.toString();
};

const createEmptyMetrics = () => ({
  transactionsTotal: 0,
  pendingTransactions: 0,
  completedTransactions: 0,
  depositsCompleted: 0,
  totalDeposits: 0,
  withdrawalsCompleted: 0,
  totalWithdrawals: 0,
  subscriptionsTotal: 0,
  subscriptionsActive: 0,
  subscriptionSpend: 0,
  signalsTotal: 0,
  signalsActive: 0,
  signalSpend: 0,
  copyTradesTotal: 0,
  copyTradesActive: 0,
  copyTradesCompleted: 0,
  copyTradeCapital: 0,
  placeTradesTotal: 0,
  placeTradesActive: 0,
  placeTradesCompleted: 0,
  placeTradeVolume: 0,
  placeTradePnl: 0,
  tradesTotal: 0,
  tradesActive: 0,
  tradesCompleted: 0,
  tradeVolume: 0,
  tradePnl: 0,
  buyBotsTotal: 0,
  buyBotsActive: 0,
  buyBotBudget: 0,
  miningTotal: 0,
  miningActive: 0,
  miningRewards: 0,
  stakesTotal: 0,
  stakesActive: 0,
  totalStaked: 0,
  realEstateTotal: 0,
  realEstateActive: 0,
  totalRealEstateInvested: 0,
  lastActivityAt: null,
});

const mergeLatest = (existingIso, incomingDateValue) => {
  const existingMs = asDateMs(existingIso);
  const incomingMs = asDateMs(incomingDateValue);
  if (!incomingMs) return existingIso || null;
  return incomingMs > existingMs
    ? new Date(incomingMs).toISOString()
    : existingIso || null;
};

const buildMetricsByUser = async (userIds) => {
  if (!Array.isArray(userIds) || userIds.length === 0) {
    return {};
  }

  const ids = userIds.map((id) => getUserKey(id)).filter(Boolean);
  const filter = { user: { $in: userIds } };
  const metricsByUser = Object.fromEntries(
    ids.map((id) => [id, createEmptyMetrics()])
  );

  const [
    transactionAgg,
    subscriptionAgg,
    signalAgg,
    copyTradeAgg,
    placeTradeAgg,
    tradeAgg,
    buyBotAgg,
    miningAgg,
    stakeAgg,
    realEstateAgg,
  ] = await Promise.all([
    Transaction.aggregate([
      { $match: filter },
      {
        $group: {
          _id: "$user",
          total: { $sum: 1 },
          pending: {
            $sum: { $cond: [{ $eq: ["$status", "Pending"] }, 1, 0] },
          },
          completed: {
            $sum: { $cond: [{ $eq: ["$status", "Completed"] }, 1, 0] },
          },
          depositsCompleted: {
            $sum: {
              $cond: [
                {
                  $and: [
                    { $eq: ["$type", "Deposit"] },
                    { $eq: ["$status", "Completed"] },
                  ],
                },
                1,
                0,
              ],
            },
          },
          totalDeposits: {
            $sum: {
              $cond: [
                {
                  $and: [
                    { $eq: ["$type", "Deposit"] },
                    { $eq: ["$status", "Completed"] },
                  ],
                },
                "$amount",
                0,
              ],
            },
          },
          withdrawalsCompleted: {
            $sum: {
              $cond: [
                {
                  $and: [
                    { $eq: ["$type", "Withdrawal"] },
                    { $eq: ["$status", "Completed"] },
                  ],
                },
                1,
                0,
              ],
            },
          },
          totalWithdrawals: {
            $sum: {
              $cond: [
                {
                  $and: [
                    { $eq: ["$type", "Withdrawal"] },
                    { $eq: ["$status", "Completed"] },
                  ],
                },
                "$amount",
                0,
              ],
            },
          },
          lastAt: { $max: "$createdAt" },
        },
      },
    ]),
    Subscription.aggregate([
      { $match: filter },
      {
        $group: {
          _id: "$user",
          total: { $sum: 1 },
          active: {
            $sum: { $cond: [{ $eq: ["$status", "Active"] }, 1, 0] },
          },
          spend: { $sum: { $ifNull: ["$price", 0] } },
          lastAt: { $max: "$createdAt" },
        },
      },
    ]),
    Signal.aggregate([
      { $match: filter },
      {
        $group: {
          _id: "$user",
          total: { $sum: 1 },
          active: {
            $sum: {
              $cond: [
                { $eq: [{ $toLower: { $ifNull: ["$status", ""] } }, "active"] },
                1,
                0,
              ],
            },
          },
          spend: { $sum: { $ifNull: ["$amountPaid", 0] } },
          lastAt: { $max: "$createdAt" },
        },
      },
    ]),
    CopyTrade.aggregate([
      { $match: filter },
      {
        $group: {
          _id: "$user",
          total: { $sum: 1 },
          active: {
            $sum: { $cond: [{ $eq: ["$status", "Active"] }, 1, 0] },
          },
          completed: {
            $sum: { $cond: [{ $eq: ["$status", "Completed"] }, 1, 0] },
          },
          capital: { $sum: { $ifNull: ["$amount", 0] } },
          lastAt: { $max: "$createdAt" },
        },
      },
    ]),
    PlaceTrade.aggregate([
      { $match: filter },
      {
        $group: {
          _id: "$user",
          total: { $sum: 1 },
          active: {
            $sum: { $cond: [{ $eq: ["$status", "Active"] }, 1, 0] },
          },
          completed: {
            $sum: { $cond: [{ $eq: ["$status", "Completed"] }, 1, 0] },
          },
          volume: { $sum: { $ifNull: ["$amount", 0] } },
          pnl: { $sum: { $ifNull: ["$profitLoss", 0] } },
          lastAt: { $max: "$createdAt" },
        },
      },
    ]),
    Trade.aggregate([
      { $match: filter },
      {
        $group: {
          _id: "$user",
          total: { $sum: 1 },
          active: {
            $sum: { $cond: [{ $eq: ["$status", "Active"] }, 1, 0] },
          },
          completed: {
            $sum: { $cond: [{ $eq: ["$status", "Completed"] }, 1, 0] },
          },
          volume: { $sum: { $ifNull: ["$amount", 0] } },
          pnl: { $sum: { $ifNull: ["$profitLoss", 0] } },
          lastAt: { $max: "$createdAt" },
        },
      },
    ]),
    BuyBot.aggregate([
      { $match: filter },
      {
        $group: {
          _id: "$user",
          total: { $sum: 1 },
          active: {
            $sum: { $cond: [{ $eq: ["$status", "Active"] }, 1, 0] },
          },
          budget: { $sum: { $ifNull: ["$budget", 0] } },
          lastAt: { $max: "$createdAt" },
        },
      },
    ]),
    Mining.aggregate([
      { $match: filter },
      {
        $group: {
          _id: "$user",
          total: { $sum: 1 },
          active: {
            $sum: { $cond: [{ $eq: ["$status", "Active"] }, 1, 0] },
          },
          rewards: { $sum: { $ifNull: ["$rewardBalance", 0] } },
          lastAt: { $max: "$createdAt" },
        },
      },
    ]),
    Stake.aggregate([
      { $match: filter },
      {
        $group: {
          _id: "$user",
          total: { $sum: 1 },
          active: {
            $sum: { $cond: [{ $eq: ["$status", "Active"] }, 1, 0] },
          },
          totalAmount: { $sum: { $ifNull: ["$amount", 0] } },
          lastAt: { $max: "$createdAt" },
        },
      },
    ]),
    RealEstate.aggregate([
      { $match: filter },
      {
        $group: {
          _id: "$user",
          total: { $sum: 1 },
          active: {
            $sum: { $cond: [{ $eq: ["$status", "Active"] }, 1, 0] },
          },
          totalAmount: { $sum: { $ifNull: ["$amount", 0] } },
          lastAt: { $max: "$createdAt" },
        },
      },
    ]),
  ]);

  const applyAggregate = (aggItems, updater) => {
    aggItems.forEach((item) => {
      const key = getUserKey(item?._id);
      if (!key || !metricsByUser[key]) return;
      updater(metricsByUser[key], item);
    });
  };

  applyAggregate(transactionAgg, (metrics, item) => {
    metrics.transactionsTotal = asNumber(item.total);
    metrics.pendingTransactions = asNumber(item.pending);
    metrics.completedTransactions = asNumber(item.completed);
    metrics.depositsCompleted = asNumber(item.depositsCompleted);
    metrics.totalDeposits = asNumber(item.totalDeposits);
    metrics.withdrawalsCompleted = asNumber(item.withdrawalsCompleted);
    metrics.totalWithdrawals = asNumber(item.totalWithdrawals);
    metrics.lastActivityAt = mergeLatest(metrics.lastActivityAt, item.lastAt);
  });

  applyAggregate(subscriptionAgg, (metrics, item) => {
    metrics.subscriptionsTotal = asNumber(item.total);
    metrics.subscriptionsActive = asNumber(item.active);
    metrics.subscriptionSpend = asNumber(item.spend);
    metrics.lastActivityAt = mergeLatest(metrics.lastActivityAt, item.lastAt);
  });

  applyAggregate(signalAgg, (metrics, item) => {
    metrics.signalsTotal = asNumber(item.total);
    metrics.signalsActive = asNumber(item.active);
    metrics.signalSpend = asNumber(item.spend);
    metrics.lastActivityAt = mergeLatest(metrics.lastActivityAt, item.lastAt);
  });

  applyAggregate(copyTradeAgg, (metrics, item) => {
    metrics.copyTradesTotal = asNumber(item.total);
    metrics.copyTradesActive = asNumber(item.active);
    metrics.copyTradesCompleted = asNumber(item.completed);
    metrics.copyTradeCapital = asNumber(item.capital);
    metrics.lastActivityAt = mergeLatest(metrics.lastActivityAt, item.lastAt);
  });

  applyAggregate(placeTradeAgg, (metrics, item) => {
    metrics.placeTradesTotal = asNumber(item.total);
    metrics.placeTradesActive = asNumber(item.active);
    metrics.placeTradesCompleted = asNumber(item.completed);
    metrics.placeTradeVolume = asNumber(item.volume);
    metrics.placeTradePnl = asNumber(item.pnl);
    metrics.lastActivityAt = mergeLatest(metrics.lastActivityAt, item.lastAt);
  });

  applyAggregate(tradeAgg, (metrics, item) => {
    metrics.tradesTotal = asNumber(item.total);
    metrics.tradesActive = asNumber(item.active);
    metrics.tradesCompleted = asNumber(item.completed);
    metrics.tradeVolume = asNumber(item.volume);
    metrics.tradePnl = asNumber(item.pnl);
    metrics.lastActivityAt = mergeLatest(metrics.lastActivityAt, item.lastAt);
  });

  applyAggregate(buyBotAgg, (metrics, item) => {
    metrics.buyBotsTotal = asNumber(item.total);
    metrics.buyBotsActive = asNumber(item.active);
    metrics.buyBotBudget = asNumber(item.budget);
    metrics.lastActivityAt = mergeLatest(metrics.lastActivityAt, item.lastAt);
  });

  applyAggregate(miningAgg, (metrics, item) => {
    metrics.miningTotal = asNumber(item.total);
    metrics.miningActive = asNumber(item.active);
    metrics.miningRewards = asNumber(item.rewards);
    metrics.lastActivityAt = mergeLatest(metrics.lastActivityAt, item.lastAt);
  });

  applyAggregate(stakeAgg, (metrics, item) => {
    metrics.stakesTotal = asNumber(item.total);
    metrics.stakesActive = asNumber(item.active);
    metrics.totalStaked = asNumber(item.totalAmount);
    metrics.lastActivityAt = mergeLatest(metrics.lastActivityAt, item.lastAt);
  });

  applyAggregate(realEstateAgg, (metrics, item) => {
    metrics.realEstateTotal = asNumber(item.total);
    metrics.realEstateActive = asNumber(item.active);
    metrics.totalRealEstateInvested = asNumber(item.totalAmount);
    metrics.lastActivityAt = mergeLatest(metrics.lastActivityAt, item.lastAt);
  });

  return metricsByUser;
};

const createActivityItem = ({
  id,
  type,
  status = "",
  amount = 0,
  title = "",
  description = "",
  asset = "",
  direction = "",
  createdAt,
  metadata = {},
}) => ({
  id,
  type,
  status,
  amount: asNumber(amount),
  title,
  description,
  asset,
  direction,
  createdAt: toIsoStringOrNull(createdAt),
  metadata,
});

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

  await createAdminEvent({
    type: "transaction_status",
    message: `Updated ${transaction.type} transaction to ${normalizedStatus}`,
    actorId: req.user?._id,
    targetUserId: user._id,
    metadata: {
      transactionId: transaction._id.toString(),
      previousStatus,
      nextStatus: normalizedStatus,
      type: transaction.type,
      amount: asNumber(transaction.amount),
      currency: transaction.currency || "USD",
    },
  });

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

  await createAdminEvent({
    type: "kyc_status",
    message: `KYC ${normalized === "verified" ? "completed" : normalized} for ${user.email}`,
    actorId: req.user?._id,
    targetUserId: user._id,
    metadata: {
      userId: user._id.toString(),
      status: normalized,
      kycVerified: normalized === "verified",
    },
  });

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

  await createAdminEvent({
    type: "balance_adjustment",
    message: `Balance ${normalizedOperation} by ${amountValue.toFixed(2)} for ${user.email}`,
    actorId: req.user?._id,
    targetUserId: user._id,
    metadata: {
      operation: normalizedOperation,
      amount: amountValue,
      delta: signedDelta,
      previousBalance: currentBalance,
      nextBalance,
      note: `${note || ""}`.trim(),
    },
  });

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

export const listUserActivitySummary = asyncHandler(async (req, res) => {
  const users = await User.find()
    .select(
      "firstName lastName email role status balance currencyCode currencySymbol phoneNumber country kycStatus kycVerified createdAt updatedAt"
    )
    .sort({ createdAt: -1 });

  const userIds = users.map((user) => user._id);
  const metricsByUser = await buildMetricsByUser(userIds);

  const data = users
    .map((user) => {
      const userId = user._id.toString();
      const metrics = metricsByUser[userId] || createEmptyMetrics();

      return {
        id: userId,
        firstName: user.firstName || "",
        lastName: user.lastName || "",
        email: user.email || "",
        role: user.role || "user",
        status: user.status || "active",
        phoneNumber: user.phoneNumber || "",
        country: user.country || "",
        kycStatus: user.kycStatus || "not_verified",
        kycVerified: Boolean(user.kycVerified),
        currencyCode: user.currencyCode || "USD",
        currencySymbol: user.currencySymbol || "$",
        balance: asNumber(user.balance),
        createdAt: toIsoStringOrNull(user.createdAt),
        updatedAt: toIsoStringOrNull(user.updatedAt),
        lastActivityAt:
          metrics.lastActivityAt ||
          toIsoStringOrNull(user.updatedAt) ||
          toIsoStringOrNull(user.createdAt),
        metrics,
      };
    })
    .sort((a, b) => asDateMs(b.lastActivityAt) - asDateMs(a.lastActivityAt));

  const totals = data.reduce(
    (accumulator, item) => {
      accumulator.totalUsers += 1;
      accumulator.totalBalance += asNumber(item.balance);
      accumulator.activeSubscriptions += asNumber(
        item.metrics.subscriptionsActive
      );
      accumulator.activeSignals += asNumber(item.metrics.signalsActive);
      accumulator.activeCopyTrades += asNumber(item.metrics.copyTradesActive);
      accumulator.activePlaceTrades += asNumber(item.metrics.placeTradesActive);
      accumulator.pendingTransactions += asNumber(
        item.metrics.pendingTransactions
      );
      return accumulator;
    },
    {
      totalUsers: 0,
      totalBalance: 0,
      activeSubscriptions: 0,
      activeSignals: 0,
      activeCopyTrades: 0,
      activePlaceTrades: 0,
      pendingTransactions: 0,
    }
  );

  res.json({
    success: true,
    data: {
      generatedAt: new Date().toISOString(),
      users: data,
      totals,
    },
  });
});

export const getUserActivities = asyncHandler(async (req, res) => {
  const user = await User.findById(req.params.id).select(
    "firstName lastName email role status balance currencyCode currencySymbol phoneNumber country kycStatus kycVerified createdAt updatedAt"
  );

  if (!user) {
    return res.status(404).json({
      success: false,
      message: "User not found",
    });
  }

  const limit = parseLimit(req.query.limit, 150, 20, 600);
  const baseFilter = { user: user._id };

  const [
    subscriptions,
    signals,
    copyTrades,
    placeTrades,
    trades,
    transactions,
    buyBots,
    miningRecords,
    stakes,
    realEstateRecords,
  ] = await Promise.all([
    Subscription.find(baseFilter).sort({ createdAt: -1 }).limit(limit).lean(),
    Signal.find(baseFilter).sort({ createdAt: -1 }).limit(limit).lean(),
    CopyTrade.find(baseFilter).sort({ createdAt: -1 }).limit(limit).lean(),
    PlaceTrade.find(baseFilter).sort({ createdAt: -1 }).limit(limit).lean(),
    Trade.find(baseFilter).sort({ createdAt: -1 }).limit(limit).lean(),
    Transaction.find(baseFilter).sort({ createdAt: -1 }).limit(limit).lean(),
    BuyBot.find(baseFilter).sort({ createdAt: -1 }).limit(limit).lean(),
    Mining.find(baseFilter).sort({ createdAt: -1 }).limit(limit).lean(),
    Stake.find(baseFilter).sort({ createdAt: -1 }).limit(limit).lean(),
    RealEstate.find(baseFilter).sort({ createdAt: -1 }).limit(limit).lean(),
  ]);

  const activities = [
    ...subscriptions.map((item) =>
      createActivityItem({
        id: item._id.toString(),
        type: "Subscription",
        status: item.status,
        amount: item.price,
        title: item.planName || "Subscription",
        description: `Subscription ${item.status || "Active"}`,
        createdAt: item.createdAt,
        metadata: {
          startsAt: toIsoStringOrNull(item.startsAt),
          endsAt: toIsoStringOrNull(item.endsAt),
        },
      })
    ),
    ...signals.map((item) =>
      createActivityItem({
        id: item._id.toString(),
        type: "Signal",
        status: item.status,
        amount: item.amountPaid,
        title: item.planName || item.title || item.provider || "Signal Plan",
        description: item.description || item.message || "",
        asset: item.asset || "",
        createdAt: item.createdAt,
        metadata: {
          provider: item.provider || "",
          dailySignals: asNumber(item.dailySignals),
          winRate: item.winRate || "",
        },
      })
    ),
    ...copyTrades.map((item) =>
      createActivityItem({
        id: item._id.toString(),
        type: "CopyTrade",
        status: item.status,
        amount: item.amount,
        title: item.traderName || "Copy Trade",
        description: `Source Trader: ${item.sourceTraderId || "N/A"}`,
        createdAt: item.createdAt,
        metadata: {
          performance: asNumber(item.performance),
        },
      })
    ),
    ...placeTrades.map((item) =>
      createActivityItem({
        id: item._id.toString(),
        type: "PlaceTrade",
        status: item.status,
        amount: item.amount,
        title: item.asset || "Place Trade",
        description: `${item.tradeType || "Trade"} ${item.result || ""}`.trim(),
        asset: item.asset || "",
        direction: item.direction || "",
        createdAt: item.createdAt,
        metadata: {
          duration: item.duration || "",
          lotSize: asNumber(item.lotSize),
          takeProfit: item.takeProfit || "",
          stopLoss: item.stopLoss || "",
          profitLoss: asNumber(item.profitLoss),
        },
      })
    ),
    ...trades.map((item) =>
      createActivityItem({
        id: item._id.toString(),
        type: "Trade",
        status: item.status,
        amount: item.amount,
        title: item.asset || "Trade",
        description: `${item.result || ""}`.trim(),
        asset: item.asset || "",
        direction: item.direction || "",
        createdAt: item.createdAt,
        metadata: {
          leverage: asNumber(item.leverage),
          duration: item.duration || "",
          profitLoss: asNumber(item.profitLoss),
        },
      })
    ),
    ...transactions.map((item) =>
      createActivityItem({
        id: item._id.toString(),
        type: item.type || "Transaction",
        status: item.status,
        amount: item.amount,
        title: `${item.type || "Transaction"} ${item.paymentMethod ? `(${item.paymentMethod})` : ""}`.trim(),
        description: item.details || "",
        createdAt: item.createdAt,
        metadata: {
          currency: item.currency || "USD",
          paymentMethod: item.paymentMethod || "",
          walletAddress: item.walletAddress || "",
          network: item.network || "",
        },
      })
    ),
    ...buyBots.map((item) =>
      createActivityItem({
        id: item._id.toString(),
        type: "BuyBot",
        status: item.status,
        amount: item.budget,
        title: item.strategyName || "Buy Bot",
        description: item.asset ? `Asset: ${item.asset}` : "",
        asset: item.asset || "",
        createdAt: item.createdAt,
      })
    ),
    ...miningRecords.map((item) =>
      createActivityItem({
        id: item._id.toString(),
        type: "Mining",
        status: item.status,
        amount: item.rewardBalance,
        title: item.asset || "Mining",
        description: `Hash Rate: ${asNumber(item.hashRate)}`,
        asset: item.asset || "",
        createdAt: item.createdAt,
      })
    ),
    ...stakes.map((item) =>
      createActivityItem({
        id: item._id.toString(),
        type: "Stake",
        status: item.status,
        amount: item.amount,
        title: item.asset || "Stake",
        description: `APY: ${asNumber(item.apy)}%`,
        asset: item.asset || "",
        createdAt: item.createdAt,
      })
    ),
    ...realEstateRecords.map((item) =>
      createActivityItem({
        id: item._id.toString(),
        type: "RealEstate",
        status: item.status,
        amount: item.amount,
        title: item.propertyName || "Real Estate",
        description: item.location || "",
        createdAt: item.createdAt,
        metadata: {
          roi: asNumber(item.roi),
        },
      })
    ),
  ]
    .filter((item) => item.createdAt)
    .sort((a, b) => asDateMs(b.createdAt) - asDateMs(a.createdAt))
    .slice(0, limit);

  const metricsByUser = await buildMetricsByUser([user._id]);
  const metrics = metricsByUser[user._id.toString()] || createEmptyMetrics();

  res.json({
    success: true,
    data: {
      user: {
        id: user._id.toString(),
        firstName: user.firstName || "",
        lastName: user.lastName || "",
        email: user.email || "",
        role: user.role || "user",
        status: user.status || "active",
        phoneNumber: user.phoneNumber || "",
        country: user.country || "",
        kycStatus: user.kycStatus || "not_verified",
        kycVerified: Boolean(user.kycVerified),
        currencyCode: user.currencyCode || "USD",
        currencySymbol: user.currencySymbol || "$",
        balance: asNumber(user.balance),
        createdAt: toIsoStringOrNull(user.createdAt),
        updatedAt: toIsoStringOrNull(user.updatedAt),
      },
      metrics,
      activities,
      generatedAt: new Date().toISOString(),
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

export const listReferralStats = asyncHandler(async (req, res) => {
  const limit = parseLimit(req.query.limit, 200, 20, 1000);

  const referrals = await Referral.find()
    .populate("referrer", "firstName lastName email")
    .populate("referred", "firstName lastName email createdAt")
    .sort({ createdAt: -1 })
    .limit(limit);

  const rows = referrals.map((item) => ({
    id: item._id.toString(),
    referrerId:
      item.referrer?._id?.toString() || item.referrer?.toString() || "",
    referrerName: item.referrer
      ? `${item.referrer.firstName || ""} ${item.referrer.lastName || ""}`.trim()
      : "Unknown",
    referrerEmail: item.referrer?.email || "",
    referredId:
      item.referred?._id?.toString() || item.referred?.toString() || "",
    referredName: item.referred
      ? `${item.referred.firstName || ""} ${item.referred.lastName || ""}`.trim()
      : "",
    referredEmail:
      item.referred?.email || item.referredEmail || "Pending user",
    status: item.status || "Pending",
    rewardAmount: asNumber(item.rewardAmount),
    rewardStatus: item.rewardStatus || "Pending",
    createdAt: toIsoStringOrNull(item.createdAt),
    updatedAt: toIsoStringOrNull(item.updatedAt),
  }));

  const totals = rows.reduce(
    (accumulator, row) => {
      accumulator.totalReferrals += 1;
      if (`${row.status}`.toLowerCase() === "active") {
        accumulator.activeReferrals += 1;
      }
      accumulator.totalRewardAmount += asNumber(row.rewardAmount);
      if (`${row.rewardStatus}`.toLowerCase() === "paid") {
        accumulator.paidRewards += asNumber(row.rewardAmount);
      }
      return accumulator;
    },
    {
      totalReferrals: 0,
      activeReferrals: 0,
      totalRewardAmount: 0,
      paidRewards: 0,
    }
  );

  res.json({
    success: true,
    data: {
      generatedAt: new Date().toISOString(),
      totals,
      referrals: rows,
    },
  });
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

export const listSystemMetrics = asyncHandler(async (req, res) => {
  const now = Date.now();
  const dayAgo = new Date(now - 24 * 60 * 60 * 1000);

  const [
    totalUsers,
    activeUsers,
    suspendedUsers,
    pendingKyc,
    completedKyc,
    rejectedKyc,
    pendingTransactions,
    completedTransactions,
    transactionVolume24hAgg,
    openTickets,
    pendingTickets,
    unreadForAdminThreads,
    activeTrades,
    activePlaceTrades,
    activeSignals,
    activeSubscriptions,
    activeCopyTrades,
    activeMining,
    activeStakes,
  ] = await Promise.all([
    User.countDocuments({ role: "user" }),
    User.countDocuments({ role: "user", status: "active" }),
    User.countDocuments({ role: "user", status: "suspended" }),
    Kyc.countDocuments({ status: "pending" }),
    Kyc.countDocuments({ status: "verified" }),
    Kyc.countDocuments({ status: "rejected" }),
    Transaction.countDocuments({ status: "Pending" }),
    Transaction.countDocuments({ status: "Completed" }),
    Transaction.aggregate([
      {
        $match: {
          status: "Completed",
          createdAt: { $gte: dayAgo },
        },
      },
      { $group: { _id: null, total: { $sum: "$amount" } } },
    ]),
    SupportThread.countDocuments({ status: "open" }),
    SupportThread.countDocuments({ status: "pending" }),
    SupportThread.countDocuments({ unreadForAdmin: { $gt: 0 } }),
    Trade.countDocuments({ status: "Active" }),
    PlaceTrade.countDocuments({ status: "Active" }),
    Signal.countDocuments({
      status: { $regex: /^active$/i },
    }),
    Subscription.countDocuments({ status: "Active" }),
    CopyTrade.countDocuments({ status: "Active" }),
    Mining.countDocuments({ status: "Active" }),
    Stake.countDocuments({ status: "Active" }),
  ]);

  const txVolume24h = asNumber(transactionVolume24hAgg?.[0]?.total);

  res.json({
    success: true,
    data: {
      generatedAt: new Date(now).toISOString(),
      users: {
        total: totalUsers,
        active: activeUsers,
        suspended: suspendedUsers,
      },
      kyc: {
        pending: pendingKyc,
        completed: completedKyc,
        rejected: rejectedKyc,
      },
      transactions: {
        pending: pendingTransactions,
        completed: completedTransactions,
        volume24h: txVolume24h,
      },
      support: {
        open: openTickets,
        pending: pendingTickets,
        unreadForAdmin: unreadForAdminThreads,
      },
      activeModules: {
        trades: activeTrades,
        placeTrades: activePlaceTrades,
        signals: activeSignals,
        subscriptions: activeSubscriptions,
        copyTrades: activeCopyTrades,
        mining: activeMining,
        stakes: activeStakes,
      },
    },
  });
});

export const listAdminLogs = asyncHandler(async (req, res) => {
  const limit = parseLimit(req.query.limit, 120, 20, 500);
  const typeFilter = safeTrim(req.query.type).toLowerCase();
  const query = typeFilter ? { type: typeFilter } : {};

  const rows = await AdminEvent.find(query)
    .populate("actor", "firstName lastName email")
    .populate("targetUser", "firstName lastName email")
    .sort({ createdAt: -1 })
    .limit(limit);

  const data = rows.map((item) => ({
    id: item._id.toString(),
    type: item.type || "system",
    message: item.message || "",
    actor: item.actor
      ? {
          id: item.actor._id.toString(),
          name: `${item.actor.firstName || ""} ${item.actor.lastName || ""}`.trim(),
          email: item.actor.email || "",
        }
      : null,
    targetUser: item.targetUser
      ? {
          id: item.targetUser._id.toString(),
          name: `${item.targetUser.firstName || ""} ${item.targetUser.lastName || ""}`.trim(),
          email: item.targetUser.email || "",
        }
      : null,
    metadata: item.metadata || {},
    createdAt: toIsoStringOrNull(item.createdAt),
    updatedAt: toIsoStringOrNull(item.updatedAt),
  }));

  res.json({
    success: true,
    data,
    totals: {
      count: data.length,
    },
    generatedAt: new Date().toISOString(),
  });
});

export const broadcastAdminMessage = asyncHandler(async (req, res) => {
  const subjectInput = safeTrim(req.body.subject);
  const messageInput = safeTrim(req.body.message || req.body.body);
  const includeOnlyActive = req.body.onlyActive !== false;
  const planFilters = normalizePlanFilter(req.body.plans);

  if (!messageInput) {
    return res.status(400).json({
      success: false,
      message: "message is required",
    });
  }

  const subject = subjectInput || "Platform Broadcast";
  const query = { role: "user" };

  if (includeOnlyActive) {
    query.status = "active";
  }

  if (planFilters.length > 0) {
    query.subscriptionPlan = {
      $in: planFilters.map((plan) => new RegExp(`^${plan}$`, "i")),
    };
  }

  const recipients = await User.find(query)
    .select("_id firstName lastName email subscriptionPlan status")
    .sort({ createdAt: -1 })
    .limit(5000);

  if (recipients.length === 0) {
    return res.status(404).json({
      success: false,
      message: "No users matched broadcast target.",
    });
  }

  const now = new Date();
  const statusByPlan = {};
  const threads = recipients.map((user) => {
    const normalizedPlan = safeTrim(user.subscriptionPlan || "Basic") || "Basic";
    statusByPlan[normalizedPlan] = (statusByPlan[normalizedPlan] || 0) + 1;
    return {
      user: user._id,
      subject,
      status: "pending",
      unreadForUser: 1,
      unreadForAdmin: 0,
      lastMessageAt: now,
      messages: [
        {
          senderRole: "admin",
          sender: req.user._id,
          text: messageInput,
          readByUser: false,
          readByAdmin: true,
          createdAt: now,
        },
      ],
      createdAt: now,
      updatedAt: now,
    };
  });

  await SupportThread.insertMany(threads, { ordered: false });

  await createAdminEvent({
    type: "broadcast",
    message: `Broadcast sent to ${recipients.length} users`,
    actorId: req.user?._id,
    metadata: {
      subject,
      onlyActive: includeOnlyActive,
      plans: planFilters,
      recipients: recipients.length,
      plansBreakdown: statusByPlan,
    },
  });

  res.status(201).json({
    success: true,
    data: {
      subject,
      recipients: recipients.length,
      plansBreakdown: statusByPlan,
      sentAt: now.toISOString(),
    },
  });
});
