import bcrypt from "bcryptjs";
import crypto from "crypto";
import jwt from "jsonwebtoken";
import User from "../models/User.js";
import Referral from "../models/Referral.js";
import { env } from "../config/env.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { buildReferralCode } from "../utils/referralCode.js";

const buildUserPayload = (user) => ({
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
    transactionCode: user.transactionCode,
    referralCode: user.referralCode,
    referredBy: user.referredBy,
  });

const createToken = (user) =>
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

export const register = asyncHandler(async (req, res) => {
  const {
    firstName,
    lastName,
    email,
    password,
    confirmPassword,
    phoneNumber,
    country,
    sex,
    currencyCode,
    currencySymbol,
    referralCode,
  } = req.body;

  if (!firstName || !lastName || !email || !password || !confirmPassword) {
    return res.status(400).json({
      success: false,
      message: "Missing required registration fields",
    });
  }

  if (password !== confirmPassword) {
    return res.status(400).json({
      success: false,
      message: "Passwords do not match",
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
    firstName: firstName.trim(),
    lastName: lastName.trim(),
    email: normalizedEmail,
    passwordHash,
    phoneNumber: phoneNumber?.trim() || "",
    country: country?.trim() || "",
    sex: sex || "",
    currencyCode: currencyCode || "USD",
    currencySymbol: currencySymbol || "$",
    subscriptionPlan: "Basic",
    status: "active",
  });

  if (!user.referralCode) {
    user.referralCode = buildReferralCode(user._id);
  }

  const normalizedReferral = `${referralCode || ""}`.trim().toUpperCase();
  if (normalizedReferral) {
    const referrer = await User.findOne({ referralCode: normalizedReferral });
    if (referrer && referrer._id.toString() !== user._id.toString()) {
      user.referredBy = referrer._id;

      await Referral.create({
        referrer: referrer._id,
        referred: user._id,
        referredEmail: user.email,
        status: "Active",
        rewardAmount: env.REFERRAL_BONUS,
        rewardStatus: "Paid",
      });

      referrer.balance = Math.max(
        0,
        (Number(referrer.balance) || 0) + (Number(env.REFERRAL_BONUS) || 0)
      );
      await referrer.save();
    }
  }

  await user.save();

  const token = createToken(user);
  const payload = buildUserPayload(user);

  res.status(201).json({
    success: true,
    token,
    data: {
      token,
      ...payload,
      user: payload,
    },
  });
});

export const login = asyncHandler(async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({
      success: false,
      message: "Email and password are required",
    });
  }

  const normalizedEmail = email.toLowerCase().trim();
  const user = await User.findOne({ email: normalizedEmail });
  if (!user) {
    return res.status(401).json({
      success: false,
      message: "Invalid credentials",
    });
  }

  const isMatch = await bcrypt.compare(password, user.passwordHash);
  if (!isMatch) {
    return res.status(401).json({
      success: false,
      message: "Invalid credentials",
    });
  }

  const token = createToken(user);
  const payload = buildUserPayload(user);

  res.json({
    success: true,
    token,
    data: {
      token,
      ...payload,
      user: payload,
    },
  });
});

export const logout = asyncHandler(async (req, res) => {
  res.json({ success: true, message: "Logged out" });
});

export const forgotPassword = asyncHandler(async (req, res) => {
  const { email } = req.body;
  if (!email) {
    return res.status(400).json({
      success: false,
      message: "Email is required",
    });
  }

  const normalizedEmail = email.toLowerCase().trim();
  const user = await User.findOne({ email: normalizedEmail });

  if (!user) {
    return res.json({
      success: true,
      message: "If the email exists, a reset link will be sent",
    });
  }

  const resetToken = crypto.randomBytes(32).toString("hex");
  const resetTokenHash = crypto
    .createHash("sha256")
    .update(resetToken)
    .digest("hex");
  const expiresAt = new Date(
    Date.now() + env.RESET_TOKEN_TTL_MINUTES * 60 * 1000
  );

  user.resetTokenHash = resetTokenHash;
  user.resetTokenExpires = expiresAt;
  await user.save();

  res.json({
    success: true,
    message: "If the email exists, a reset link will be sent",
    data: {
      resetToken,
      expiresAt,
    },
  });
});

export const resetPassword = asyncHandler(async (req, res) => {
  const { token, password } = req.body;
  if (!token || !password) {
    return res.status(400).json({
      success: false,
      message: "Token and new password are required",
    });
  }

  if (password.length < 6) {
    return res.status(400).json({
      success: false,
      message: "Password must be at least 6 characters",
    });
  }

  const resetTokenHash = crypto
    .createHash("sha256")
    .update(token)
    .digest("hex");

  const user = await User.findOne({
    resetTokenHash,
    resetTokenExpires: { $gt: new Date() },
  });

  if (!user) {
    return res.status(400).json({
      success: false,
      message: "Invalid or expired reset token",
    });
  }

  user.passwordHash = await bcrypt.hash(password, 10);
  user.resetTokenHash = "";
  user.resetTokenExpires = undefined;
  await user.save();

  res.json({ success: true, message: "Password reset successful" });
});
