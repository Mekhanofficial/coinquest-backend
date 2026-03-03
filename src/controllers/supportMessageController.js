import mongoose from "mongoose";
import SupportThread from "../models/SupportThread.js";
import { asyncHandler } from "../utils/asyncHandler.js";

const MAX_THREAD_LIMIT = 120;
const DEFAULT_THREAD_LIMIT = 60;
const DIRECT_MESSAGE_PLANS = new Set(["platinum", "elite"]);

const normalizeLimit = (value, fallback = DEFAULT_THREAD_LIMIT) => {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.min(MAX_THREAD_LIMIT, parsed);
};

const normalizeStatusFilter = (value) => {
  const normalized = `${value || ""}`.trim().toLowerCase();
  if (!normalized) return "";
  return ["open", "pending", "resolved", "closed"].includes(normalized)
    ? normalized
    : "";
};

const normalizeSubject = (value) => {
  const text = `${value || ""}`.trim();
  return text || "Support Request";
};

const normalizeMessageText = (value) => `${value || ""}`.trim();
const normalizePlan = (value) => `${value || ""}`.trim().toLowerCase();

const mapThreadSummary = (thread) => {
  const messages = Array.isArray(thread?.messages) ? thread.messages : [];
  const latestMessage = messages[messages.length - 1] || null;

  return {
    id: thread?._id?.toString() || "",
    user: thread?.user
      ? {
          id:
            typeof thread.user === "object" && thread.user?._id
              ? thread.user._id.toString()
              : thread.user.toString(),
          firstName:
            typeof thread.user === "object" ? thread.user.firstName || "" : "",
          lastName:
            typeof thread.user === "object" ? thread.user.lastName || "" : "",
          email: typeof thread.user === "object" ? thread.user.email || "" : "",
        }
      : null,
    subject: thread?.subject || "Support Request",
    status: thread?.status || "open",
    unreadForUser: Number(thread?.unreadForUser) || 0,
    unreadForAdmin: Number(thread?.unreadForAdmin) || 0,
    lastMessageAt: thread?.lastMessageAt || thread?.updatedAt || thread?.createdAt,
    latestMessage: latestMessage
      ? {
          id: latestMessage._id?.toString() || "",
          senderRole: latestMessage.senderRole || "user",
          text: latestMessage.text || "",
          createdAt: latestMessage.createdAt || null,
        }
      : null,
    messageCount: messages.length,
    createdAt: thread?.createdAt || null,
    updatedAt: thread?.updatedAt || null,
  };
};

const mapMessage = (message) => ({
  id: message?._id?.toString() || "",
  senderRole: message?.senderRole || "user",
  sender: message?.sender?.toString ? message.sender.toString() : "",
  text: message?.text || "",
  readByUser: Boolean(message?.readByUser),
  readByAdmin: Boolean(message?.readByAdmin),
  createdAt: message?.createdAt || null,
});

const mapThreadDetails = (thread) => ({
  ...mapThreadSummary(thread),
  messages: (Array.isArray(thread?.messages) ? thread.messages : []).map(mapMessage),
});

const markAdminMessagesAsReadByUser = (thread) => {
  let touched = false;
  thread.messages.forEach((message) => {
    if (message.senderRole === "admin" && !message.readByUser) {
      message.readByUser = true;
      touched = true;
    }
  });

  if ((thread.unreadForUser || 0) > 0) {
    thread.unreadForUser = 0;
    touched = true;
  }

  return touched;
};

const markUserMessagesAsReadByAdmin = (thread) => {
  let touched = false;
  thread.messages.forEach((message) => {
    if (message.senderRole === "user" && !message.readByAdmin) {
      message.readByAdmin = true;
      touched = true;
    }
  });

  if ((thread.unreadForAdmin || 0) > 0) {
    thread.unreadForAdmin = 0;
    touched = true;
  }

  return touched;
};

export const listUserThreads = asyncHandler(async (req, res) => {
  const limit = normalizeLimit(req.query.limit, DEFAULT_THREAD_LIMIT);
  const threads = await SupportThread.find({ user: req.user._id })
    .sort({ lastMessageAt: -1, updatedAt: -1 })
    .limit(limit)
    .lean();

  res.json({
    success: true,
    data: threads.map(mapThreadSummary),
    generatedAt: new Date().toISOString(),
  });
});

export const getUserThread = asyncHandler(async (req, res) => {
  const thread = await SupportThread.findOne({
    _id: req.params.threadId,
    user: req.user._id,
  });

  if (!thread) {
    return res.status(404).json({
      success: false,
      message: "Message thread not found",
    });
  }

  const touched = markAdminMessagesAsReadByUser(thread);
  if (touched) {
    await thread.save();
  }

  res.json({
    success: true,
    data: mapThreadDetails(thread),
  });
});

export const sendUserMessage = asyncHandler(async (req, res) => {
  const normalizedPlan = normalizePlan(req.user?.subscriptionPlan || "basic");
  if (!DIRECT_MESSAGE_PLANS.has(normalizedPlan)) {
    return res.status(403).json({
      success: false,
      message:
        "Direct admin messaging is available for Platinum and Elite plans only.",
      currentPlan: req.user?.subscriptionPlan || "Basic",
      requiredPlans: ["Platinum", "Elite"],
    });
  }

  const text = normalizeMessageText(req.body.message || req.body.body);
  const subject = normalizeSubject(req.body.subject);
  const providedThreadId = `${req.body.threadId || ""}`.trim();

  if (!text) {
    return res.status(400).json({
      success: false,
      message: "Message text is required",
    });
  }

  let thread = null;
  if (providedThreadId) {
    if (!mongoose.Types.ObjectId.isValid(providedThreadId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid threadId",
      });
    }

    thread = await SupportThread.findOne({
      _id: providedThreadId,
      user: req.user._id,
    });

    if (!thread) {
      return res.status(404).json({
        success: false,
        message: "Message thread not found",
      });
    }
  } else {
    thread = new SupportThread({
      user: req.user._id,
      subject,
      status: "open",
      unreadForAdmin: 0,
      unreadForUser: 0,
      lastMessageAt: new Date(),
      messages: [],
    });
  }

  if (!thread.subject) {
    thread.subject = subject;
  }
  if (thread.status === "closed" || thread.status === "resolved") {
    thread.status = "open";
  }

  thread.messages.push({
    senderRole: "user",
    sender: req.user._id,
    text,
    readByUser: true,
    readByAdmin: false,
    createdAt: new Date(),
  });

  thread.lastMessageAt = new Date();
  thread.unreadForAdmin = (Number(thread.unreadForAdmin) || 0) + 1;
  thread.unreadForUser = 0;

  await thread.save();
  await thread.populate("user", "firstName lastName email");

  const latestMessage = thread.messages[thread.messages.length - 1];

  res.status(201).json({
    success: true,
    data: {
      thread: mapThreadSummary(thread),
      message: mapMessage(latestMessage),
    },
  });
});

export const listAdminThreads = asyncHandler(async (req, res) => {
  const limit = normalizeLimit(req.query.limit, DEFAULT_THREAD_LIMIT);
  const statusFilter = normalizeStatusFilter(req.query.status);
  const query = statusFilter ? { status: statusFilter } : {};

  const threads = await SupportThread.find(query)
    .populate("user", "firstName lastName email")
    .sort({ lastMessageAt: -1, updatedAt: -1 })
    .limit(limit);

  const summaries = threads.map(mapThreadSummary);
  const unreadThreads = summaries.filter((thread) => thread.unreadForAdmin > 0).length;

  res.json({
    success: true,
    data: summaries,
    totals: {
      totalThreads: summaries.length,
      unreadThreads,
    },
    generatedAt: new Date().toISOString(),
  });
});

export const getAdminThread = asyncHandler(async (req, res) => {
  const thread = await SupportThread.findById(req.params.threadId).populate(
    "user",
    "firstName lastName email"
  );

  if (!thread) {
    return res.status(404).json({
      success: false,
      message: "Message thread not found",
    });
  }

  const touched = markUserMessagesAsReadByAdmin(thread);
  if (touched) {
    await thread.save();
  }

  res.json({
    success: true,
    data: mapThreadDetails(thread),
  });
});

export const replyAdminThread = asyncHandler(async (req, res) => {
  const text = normalizeMessageText(req.body.message || req.body.body);
  if (!text) {
    return res.status(400).json({
      success: false,
      message: "Reply text is required",
    });
  }

  const thread = await SupportThread.findById(req.params.threadId).populate(
    "user",
    "firstName lastName email"
  );

  if (!thread) {
    return res.status(404).json({
      success: false,
      message: "Message thread not found",
    });
  }

  thread.messages.push({
    senderRole: "admin",
    sender: req.user._id,
    text,
    readByUser: false,
    readByAdmin: true,
    createdAt: new Date(),
  });

  thread.lastMessageAt = new Date();
  thread.unreadForUser = (Number(thread.unreadForUser) || 0) + 1;
  thread.unreadForAdmin = 0;
  if (thread.status === "closed") {
    thread.status = "pending";
  }

  await thread.save();
  const latestMessage = thread.messages[thread.messages.length - 1];

  res.status(201).json({
    success: true,
    data: {
      thread: mapThreadSummary(thread),
      message: mapMessage(latestMessage),
    },
  });
});

export const updateAdminThreadStatus = asyncHandler(async (req, res) => {
  const status = normalizeStatusFilter(req.body.status);
  if (!status) {
    return res.status(400).json({
      success: false,
      message: "Invalid status value",
    });
  }

  const thread = await SupportThread.findById(req.params.threadId).populate(
    "user",
    "firstName lastName email"
  );
  if (!thread) {
    return res.status(404).json({
      success: false,
      message: "Message thread not found",
    });
  }

  thread.status = status;
  await thread.save();

  res.json({
    success: true,
    data: mapThreadSummary(thread),
  });
});
