import Signal from "../models/Signal.js";
import { asyncHandler } from "../utils/asyncHandler.js";

const normalizeStatus = (value, fallback = "active") => {
  const raw = `${value || ""}`.trim().toLowerCase();
  if (!raw) return fallback;
  if (["active", "cancelled", "canceled", "completed", "paused"].includes(raw)) {
    return raw === "canceled" ? "cancelled" : raw;
  }
  return fallback;
};

const deactivateOtherSignals = async (userId, excludeId = null) => {
  const filter = {
    user: userId,
    status: "active",
  };
  if (excludeId) {
    filter._id = { $ne: excludeId };
  }

  await Signal.updateMany(filter, { status: "cancelled" });
};

export const signalController = {
  create: asyncHandler(async (req, res) => {
    const payload = { ...req.body, user: req.user._id };
    payload.status = normalizeStatus(payload.status, "active");

    if (payload.status === "active") {
      await deactivateOtherSignals(req.user._id);
    }

    const doc = await Signal.create(payload);
    res.status(201).json({ success: true, data: doc });
  }),

  list: asyncHandler(async (req, res) => {
    const docs = await Signal.find({ user: req.user._id }).sort({ createdAt: -1 });
    res.json({ success: true, data: docs });
  }),

  getById: asyncHandler(async (req, res) => {
    const doc = await Signal.findOne({ _id: req.params.id, user: req.user._id });
    if (!doc) {
      return res.status(404).json({ success: false, message: "Signal not found" });
    }
    res.json({ success: true, data: doc });
  }),

  update: asyncHandler(async (req, res) => {
    const doc = await Signal.findOne({ _id: req.params.id, user: req.user._id });
    if (!doc) {
      return res.status(404).json({ success: false, message: "Signal not found" });
    }

    const nextStatus = normalizeStatus(req.body.status, doc.status);

    if (nextStatus === "active") {
      await deactivateOtherSignals(req.user._id, doc._id);
    }

    Object.assign(doc, req.body, { status: nextStatus });
    await doc.save();

    res.json({ success: true, data: doc });
  }),

  remove: asyncHandler(async (req, res) => {
    const doc = await Signal.findOneAndDelete({
      _id: req.params.id,
      user: req.user._id,
    });
    if (!doc) {
      return res.status(404).json({ success: false, message: "Signal not found" });
    }
    res.json({ success: true, data: { id: doc._id } });
  }),
};
