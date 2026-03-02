import Transaction from "../models/Transaction.js";
import Subscription from "../models/Subscription.js";
import Signal from "../models/Signal.js";
import { asyncHandler } from "../utils/asyncHandler.js";

const TRANSACTION_TYPES = [
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
];

const TYPE_MAP = {
  deposit: "Deposit",
  withdrawal: "Withdrawal",
  trade: "Trade",
  copytrade: "CopyTrade",
  copy_trade: "CopyTrade",
  placetrade: "PlaceTrade",
  place_trade: "PlaceTrade",
  realestate: "RealEstate",
  "real estate": "RealEstate",
  signal: "Signal",
  signals: "Signal",
  subscription: "Subscription",
  subscriptions: "Subscription",
  mining: "Mining",
  stake: "Stake",
  buybot: "BuyBot",
  bot: "BuyBot",
  bots: "BuyBot",
};

const normalizeType = (value) => {
  if (!value) return null;
  const trimmed = `${value}`.trim();
  if (TRANSACTION_TYPES.includes(trimmed)) return trimmed;

  const lowered = trimmed.toLowerCase();
  if (TYPE_MAP[lowered]) return TYPE_MAP[lowered];

  const compact = lowered.replace(/[\s_-]+/g, "");
  if (TYPE_MAP[compact]) return TYPE_MAP[compact];

  return null;
};

const normalizeStatus = (value) => {
  if (!value) return "Completed";
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
        return "Completed";
    }
  }

  const normalized = `${value}`.trim().toLowerCase();
  if (normalized === "active") return "Completed";
  if (normalized === "completed") return "Completed";
  if (normalized === "pending") return "Pending";
  if (normalized === "failed") return "Failed";
  if (normalized === "cancelled" || normalized === "canceled") {
    return "Cancelled";
  }

  return "Completed";
};

const parseAmount = (value) => {
  if (typeof value === "number") return value;
  if (!value) return NaN;
  const cleaned = `${value}`.replace(/[^0-9.-]+/g, "");
  return Number(cleaned);
};

export const getHistory = asyncHandler(async (req, res) => {
  const transactions = await Transaction.find({ user: req.user._id }).sort({
    createdAt: -1,
  });

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
    metadata: tx.metadata || {},
  }));

  res.json({ success: true, data });
});

export const createTransaction = asyncHandler(async (req, res) => {
  const normalizedType = normalizeType(req.body.type);
  if (!normalizedType) {
    return res.status(400).json({
      success: false,
      message: "Invalid transaction type",
    });
  }

  const amountValue = Math.abs(parseAmount(req.body.amount));
  if (!Number.isFinite(amountValue)) {
    return res.status(400).json({
      success: false,
      message: "Invalid transaction amount",
    });
  }

  const statusValue = normalizeStatus(req.body.status);
  const paymentMethod = req.body.paymentMethod || req.body.method || "";
  const details = req.body.details || req.body.description || "";
  const metadata = req.body.metadata || {};
  const currency = req.body.currency || req.user?.currencyCode || "USD";

  const transaction = await Transaction.create({
    user: req.user._id,
    type: normalizedType,
    amount: amountValue,
    currency,
    paymentMethod,
    status: statusValue,
    details,
    metadata,
  });

  if (normalizedType === "Subscription") {
    if (statusValue === "Completed") {
      const planName =
        metadata?.planName || metadata?.subscriptionPlan || paymentMethod || "";
      if (planName) {
        await Subscription.updateMany(
          { user: req.user._id, status: "Active" },
          { status: "Cancelled", endsAt: new Date() }
        );
        await Subscription.create({
          user: req.user._id,
          planName,
          price: amountValue,
          status: "Active",
          startsAt: new Date(),
        });
        req.user.subscriptionPlan = planName;
        await req.user.save();
      }
    }

    if (statusValue === "Cancelled") {
      await Subscription.updateMany(
        { user: req.user._id, status: "Active" },
        { status: "Cancelled", endsAt: new Date() }
      );
      req.user.subscriptionPlan = "Basic";
      await req.user.save();
    }
  }

  if (normalizedType === "Signal") {
    if (statusValue === "Completed") {
      const signalDetails = metadata?.signalDetails || {};
      const planName =
        signalDetails.planName || metadata?.planName || paymentMethod || "";
      const planId = signalDetails.planId || metadata?.planId;
      if (planName) {
        await Signal.updateMany(
          { user: req.user._id, status: "active" },
          { status: "cancelled" }
        );
        await Signal.create({
          user: req.user._id,
          planId,
          planName,
          amountPaid: amountValue,
          purchaseDate: new Date(),
          status: "active",
          winRate: signalDetails.winRate || "",
          dailySignals: Number(signalDetails.dailySignals) || 0,
          description: signalDetails.description || "",
          features: Array.isArray(signalDetails.features)
            ? signalDetails.features
            : [],
        });
      }
    }

    if (statusValue === "Cancelled") {
      await Signal.updateMany(
        { user: req.user._id, status: "active" },
        { status: "cancelled" }
      );
    }
  }

  res.status(201).json({
    success: true,
    data: {
      id: transaction._id.toString(),
      type: transaction.type,
      status: transaction.status,
      subscriptionPlan: req.user.subscriptionPlan,
    },
  });
});
