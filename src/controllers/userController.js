import bcrypt from "bcryptjs";
import Deposit from "../models/Deposit.js";
import Withdrawal from "../models/Withdrawal.js";
import Trade from "../models/Trade.js";
import CopyTrade from "../models/CopyTrade.js";
import PlaceTrade from "../models/PlaceTrade.js";
import Subscription from "../models/Subscription.js";
import Mining from "../models/Mining.js";
import Stake from "../models/Stake.js";
import BuyBot from "../models/BuyBot.js";
import { asyncHandler } from "../utils/asyncHandler.js";

const sumAmounts = (items) =>
  items.reduce((total, item) => total + (Number(item.amount) || 0), 0);

const sumNumbers = (items, selector) =>
  items.reduce((total, item) => total + (Number(selector(item)) || 0), 0);

export const getDashboard = asyncHandler(async (req, res) => {
  const user = req.user;

  const [
    deposits,
    withdrawals,
    trades,
    copyTrades,
    placeTrades,
    subscriptions,
    miningRuns,
    stakes,
    bots,
  ] = await Promise.all([
    Deposit.find({ user: user._id }),
    Withdrawal.find({ user: user._id }),
    Trade.find({ user: user._id }),
    CopyTrade.find({ user: user._id }),
    PlaceTrade.find({ user: user._id }),
    Subscription.find({ user: user._id }),
    Mining.find({ user: user._id }),
    Stake.find({ user: user._id }),
    BuyBot.find({ user: user._id }),
  ]);

  const completedDeposits = deposits.filter(
    (deposit) => deposit.status === "Completed"
  );
  const completedWithdrawals = withdrawals.filter(
    (withdrawal) => withdrawal.status === "Completed"
  );
  const activeTrades = trades.filter((trade) => trade.status === "Active");
  const activePlaceTrades = placeTrades.filter(
    (trade) => trade.status === "Active"
  );
  const activeCopyTrades = copyTrades.filter((trade) =>
    ["Active", "Paused"].includes(trade.status)
  );
  const completedTrades = trades.filter((trade) => trade.status === "Completed");
  const completedPlaceTrades = placeTrades.filter(
    (trade) => trade.status === "Completed"
  );
  const completedCopyTrades = copyTrades.filter(
    (trade) => trade.status === "Completed"
  );
  const completedStakes = stakes.filter((stake) => stake.status === "Completed");

  const realizedTradePnl =
    sumNumbers(completedTrades, (trade) => trade.profitLoss) +
    sumNumbers(completedPlaceTrades, (trade) => trade.profitLoss);
  const copyTradeRevenue = sumNumbers(
    completedCopyTrades,
    (trade) => (Number(trade.amount) || 0) * ((Number(trade.performance) || 0) / 100)
  );
  const stakeRevenue = sumNumbers(completedStakes, (stake) => {
    const payout = Number(stake.payoutUsd) || 0;
    const principal = Number(stake.principalUsd) || 0;
    if (payout > 0) return Math.max(0, payout - principal);
    return Number(stake.rewardUsdTotal) || 0;
  });
  const miningRevenue = sumNumbers(miningRuns, (run) => run.rewardBalance);
  const grossRevenue = realizedTradePnl + copyTradeRevenue + stakeRevenue + miningRevenue;

  const completedTradingPool = [...completedTrades, ...completedPlaceTrades];
  const totalCompletedTrades = completedTradingPool.length;
  const totalWinningTrades = completedTradingPool.filter((trade) => {
    if (`${trade.result || ""}`.toLowerCase() === "win") return true;
    return (Number(trade.profitLoss) || 0) > 0;
  }).length;
  const winRate =
    totalCompletedTrades > 0 ? (totalWinningTrades / totalCompletedTrades) * 100 : 0;

  const totalDeposits = sumAmounts(completedDeposits);
  const totalWithdrawals = sumAmounts(completedWithdrawals);
  const netCashflow = totalDeposits - totalWithdrawals;
  const roiPercent = totalDeposits > 0 ? (grossRevenue / totalDeposits) * 100 : 0;

  const data = {
    balance: user.balance,
    firstName: user.firstName,
    lastName: user.lastName,
    email: user.email,
    phoneNumber: user.phoneNumber,
    country: user.country,
    currencyCode: user.currencyCode,
    currencySymbol: user.currencySymbol,
    photoURL: user.photoURL,
    subscriptionPlan: user.subscriptionPlan,
    kycVerified: user.kycVerified,
    kycStatus: user.kycStatus,
    role: user.role,
    status: user.status,
    stats: {
      totalDeposits,
      totalWithdrawals,
      depositCount: deposits.length,
      withdrawalCount: withdrawals.length,
      tradeCount: trades.length,
      copyTradeCount: copyTrades.length,
      placeTradeCount: placeTrades.length,
      subscriptionCount: subscriptions.length,
      miningCount: miningRuns.length,
      stakeCount: stakes.length,
      botCount: bots.length,
    },
    revenue: {
      grossRevenue,
      realizedTradePnl,
      copyTradeRevenue,
      stakeRevenue,
      miningRevenue,
      activeTrades:
        activeTrades.length + activePlaceTrades.length + activeCopyTrades.length,
      activeSpotTrades: activeTrades.length,
      activePlaceTrades: activePlaceTrades.length,
      activeCopyTrades: activeCopyTrades.length,
      totalWinningTrades,
      totalCompletedTrades,
      winRate,
      netCashflow,
      roiPercent,
    },
  };

  res.json({ success: true, data });
});

export const getProfile = asyncHandler(async (req, res) => {
  const user = req.user;
  res.json({
    success: true,
    data: {
      id: user._id.toString(),
      userId: user._id.toString(),
      uid: user._id.toString(),
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      phoneNumber: user.phoneNumber,
      country: user.country,
      sex: user.sex,
      currencyCode: user.currencyCode,
      currencySymbol: user.currencySymbol,
      photoURL: user.photoURL,
      balance: user.balance,
      subscriptionPlan: user.subscriptionPlan,
      kycVerified: user.kycVerified,
      kycStatus: user.kycStatus,
      role: user.role,
      status: user.status,
    },
  });
});

export const updateProfile = asyncHandler(async (req, res) => {
  const user = req.user;
  const allowedFields = [
    "firstName",
    "lastName",
    "phoneNumber",
    "country",
    "sex",
    "currencyCode",
    "currencySymbol",
    "photoURL",
  ];

  allowedFields.forEach((field) => {
    if (req.body[field] !== undefined) {
      user[field] = req.body[field];
    }
  });

  await user.save();

  res.json({
    success: true,
    data: {
      id: user._id.toString(),
      firstName: user.firstName,
      lastName: user.lastName,
      phoneNumber: user.phoneNumber,
      country: user.country,
      sex: user.sex,
      currencyCode: user.currencyCode,
      currencySymbol: user.currencySymbol,
      photoURL: user.photoURL,
    },
  });
});

export const getKycStatus = asyncHandler(async (req, res) => {
  const user = req.user;
  res.json({
    success: true,
    status: user.kycStatus || "not_verified",
    verified: user.kycVerified || false,
  });
});

export const changePassword = asyncHandler(async (req, res) => {
  const { currentPassword, newPassword } = req.body;
  if (!currentPassword || !newPassword) {
    return res.status(400).json({
      success: false,
      message: "Current password and new password are required",
    });
  }

  if (newPassword.length < 6) {
    return res.status(400).json({
      success: false,
      message: "Password must be at least 6 characters",
    });
  }

  const isMatch = await bcrypt.compare(currentPassword, req.user.passwordHash);
  if (!isMatch) {
    return res.status(400).json({
      success: false,
      message: "Current password is incorrect",
    });
  }

  req.user.passwordHash = await bcrypt.hash(newPassword, 10);
  await req.user.save();

  res.json({ success: true, message: "Password updated successfully" });
});

export const adjustBalance = asyncHandler(async (req, res) => {
  const amount = Number(req.body.amount);
  if (!Number.isFinite(amount) || amount === 0) {
    return res.status(400).json({
      success: false,
      message: "Invalid balance adjustment amount",
    });
  }

  const user = req.user;
  const currentBalance = Number(user.balance) || 0;
  const nextBalance = currentBalance + amount;

  if (nextBalance < 0) {
    return res.status(400).json({
      success: false,
      message: "Insufficient balance",
    });
  }

  user.balance = nextBalance;
  await user.save();

  res.json({
    success: true,
    data: {
      balance: user.balance,
    },
  });
});
