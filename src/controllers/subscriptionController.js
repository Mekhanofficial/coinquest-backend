import Subscription from "../models/Subscription.js";
import { asyncHandler } from "../utils/asyncHandler.js";

const DAY_MS = 24 * 60 * 60 * 1000;

const PLAN_MAP = {
  basic: "Basic",
  standard: "Standard",
  premium: "Premium",
  platinum: "Platinum",
  elite: "Elite",
};

const STATUS_MAP = {
  active: "Active",
  cancelled: "Cancelled",
  canceled: "Cancelled",
  expired: "Expired",
};

const toDate = (value) => {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const toPositiveNumber = (value, fallback = 0) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(0, parsed);
};

const normalizePlanName = (value, fallback = "Basic") => {
  const key = `${value || ""}`.trim().toLowerCase();
  return PLAN_MAP[key] || fallback;
};

const normalizeStatus = (value, fallback = "Active") => {
  const key = `${value || ""}`.trim().toLowerCase();
  return STATUS_MAP[key] || fallback;
};

const markExpiredSubscriptions = async (userId) => {
  const now = new Date();
  await Subscription.updateMany(
    {
      user: userId,
      status: "Active",
      endsAt: { $ne: null, $lte: now },
    },
    { status: "Expired" }
  );
};

const deactivateOtherActiveSubscriptions = async (userId, excludeId = null) => {
  const update = {
    status: "Cancelled",
    endsAt: new Date(),
  };

  const filter = {
    user: userId,
    status: "Active",
  };

  if (excludeId) {
    filter._id = { $ne: excludeId };
  }

  await Subscription.updateMany(filter, update);
};

const resolveCurrentPlan = async (userId) => {
  await markExpiredSubscriptions(userId);

  const activeSubscription = await Subscription.findOne({
    user: userId,
    status: "Active",
  }).sort({ createdAt: -1 });

  return activeSubscription?.planName || "Basic";
};

const syncUserPlan = async (user) => {
  const resolvedPlan = await resolveCurrentPlan(user._id);
  if (user.subscriptionPlan !== resolvedPlan) {
    user.subscriptionPlan = resolvedPlan;
    await user.save();
  }
  return resolvedPlan;
};

const buildSubscriptionPayload = (body = {}) => {
  const startsAt = toDate(body.startsAt) || new Date();
  const explicitEndsAt = toDate(body.endsAt);
  const durationDays = Number(body.durationDays);

  let endsAt = explicitEndsAt;
  if (!endsAt && Number.isFinite(durationDays) && durationDays > 0) {
    endsAt = new Date(startsAt.getTime() + durationDays * DAY_MS);
  }

  return {
    planName: normalizePlanName(body.planName || body.plan || body.method),
    price: toPositiveNumber(body.price ?? body.amount),
    status: normalizeStatus(body.status, "Active"),
    startsAt,
    endsAt,
  };
};

export const subscriptionController = {
  create: asyncHandler(async (req, res) => {
    const payload = buildSubscriptionPayload(req.body);
    payload.user = req.user._id;

    if (payload.status === "Active") {
      await deactivateOtherActiveSubscriptions(req.user._id);
    }

    const doc = await Subscription.create(payload);
    const currentPlan = await syncUserPlan(req.user);

    res.status(201).json({
      success: true,
      data: doc,
      currentPlan,
    });
  }),

  list: asyncHandler(async (req, res) => {
    const currentPlan = await syncUserPlan(req.user);
    const docs = await Subscription.find({ user: req.user._id }).sort({
      createdAt: -1,
    });

    res.json({
      success: true,
      data: docs,
      currentPlan,
    });
  }),

  getById: asyncHandler(async (req, res) => {
    await markExpiredSubscriptions(req.user._id);

    const doc = await Subscription.findOne({
      _id: req.params.id,
      user: req.user._id,
    });

    if (!doc) {
      return res
        .status(404)
        .json({ success: false, message: "Subscription not found" });
    }

    const currentPlan = await syncUserPlan(req.user);

    return res.json({
      success: true,
      data: doc,
      currentPlan,
    });
  }),

  update: asyncHandler(async (req, res) => {
    const doc = await Subscription.findOne({
      _id: req.params.id,
      user: req.user._id,
    });

    if (!doc) {
      return res
        .status(404)
        .json({ success: false, message: "Subscription not found" });
    }

    if (req.body.planName !== undefined || req.body.plan !== undefined) {
      doc.planName = normalizePlanName(req.body.planName || req.body.plan, doc.planName);
    }
    if (req.body.price !== undefined || req.body.amount !== undefined) {
      doc.price = toPositiveNumber(req.body.price ?? req.body.amount, doc.price);
    }
    if (req.body.status !== undefined) {
      doc.status = normalizeStatus(req.body.status, doc.status);
    }
    if (req.body.startsAt !== undefined) {
      doc.startsAt = toDate(req.body.startsAt) || doc.startsAt;
    }
    if (req.body.endsAt !== undefined) {
      doc.endsAt = toDate(req.body.endsAt);
    }
    if (req.body.durationDays !== undefined) {
      const durationDays = Number(req.body.durationDays);
      if (Number.isFinite(durationDays) && durationDays > 0) {
        doc.endsAt = new Date(doc.startsAt.getTime() + durationDays * DAY_MS);
      }
    }

    if (doc.status === "Active") {
      await deactivateOtherActiveSubscriptions(req.user._id, doc._id);
    }

    await doc.save();

    const currentPlan = await syncUserPlan(req.user);

    return res.json({
      success: true,
      data: doc,
      currentPlan,
    });
  }),

  remove: asyncHandler(async (req, res) => {
    const doc = await Subscription.findOneAndDelete({
      _id: req.params.id,
      user: req.user._id,
    });

    if (!doc) {
      return res
        .status(404)
        .json({ success: false, message: "Subscription not found" });
    }

    const currentPlan = await syncUserPlan(req.user);

    res.json({
      success: true,
      data: { id: doc._id },
      currentPlan,
    });
  }),
};
