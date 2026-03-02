import Trade from "../models/Trade.js";
import Transaction from "../models/Transaction.js";
import { asyncHandler } from "../utils/asyncHandler.js";

export const createTrade = asyncHandler(async (req, res) => {
  const amount = Number(req.body.amount);
  if (!amount || Number.isNaN(amount) || amount <= 0) {
    return res.status(400).json({
      success: false,
      message: "Trade amount is required",
    });
  }

  const trade = await Trade.create({
    user: req.user._id,
    asset: req.body.asset || "",
    amount,
    direction: req.body.direction || "",
    leverage: req.body.leverage || 1,
    duration: req.body.duration || "",
    status: "Active",
    result: "Pending",
    startedAt: new Date(),
  });

  res.status(201).json({ success: true, data: trade });
});

export const listTrades = asyncHandler(async (req, res) => {
  const trades = await Trade.find({ user: req.user._id }).sort({
    createdAt: -1,
  });
  res.json({ success: true, data: trades });
});

export const completeTrade = asyncHandler(async (req, res) => {
  const { tradeId, result, profitLoss } = req.body;
  if (!tradeId) {
    return res.status(400).json({
      success: false,
      message: "tradeId is required",
    });
  }

  const trade = await Trade.findOne({ _id: tradeId, user: req.user._id });
  if (!trade) {
    return res.status(404).json({
      success: false,
      message: "Trade not found",
    });
  }

  const normalizedResult = `${result || ""}`.toLowerCase();
  const isWin = normalizedResult === "win" || normalizedResult === "won";

  let delta = Number(profitLoss);
  if (!Number.isFinite(delta)) {
    const base = Number(trade.amount) || 0;
    delta = isWin ? base * 0.1 : -base * 0.1;
  }

  trade.status = "Completed";
  trade.result = isWin ? "Win" : "Loss";
  trade.profitLoss = delta;
  trade.endedAt = new Date();
  await trade.save();

  req.user.balance = Math.max(0, req.user.balance + delta);
  await req.user.save();

  await Transaction.create({
    user: req.user._id,
    type: "Trade",
    amount: Math.abs(delta),
    currency: "USD",
    paymentMethod: "Trade",
    status: "Completed",
    details: `Trade ${trade._id.toString()} ${trade.result}`,
    metadata: { profitLoss: delta },
  });

  res.json({
    success: true,
    data: {
      id: trade._id.toString(),
      status: trade.status,
      result: trade.result,
      profitLoss: trade.profitLoss,
      newBalance: req.user.balance,
    },
  });
});
