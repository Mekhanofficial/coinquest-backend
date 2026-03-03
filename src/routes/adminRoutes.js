import { Router } from "express";
import {
  updateTransactionStatus,
  updateKycStatus,
  registerAdmin,
  listUsers,
  listUserActivitySummary,
  getUserActivities,
  updateUserStatus,
  deleteUser,
  adjustUserBalance,
  listKycSubmissions,
  listReferralStats,
  listTransactions,
  listSystemMetrics,
  listAdminLogs,
  broadcastAdminMessage,
} from "../controllers/adminController.js";
import {
  listAdminThreads,
  getAdminThread,
  replyAdminThread,
  updateAdminThreadStatus,
} from "../controllers/supportMessageController.js";
import { authenticate, requireAdmin } from "../middleware/auth.js";

const router = Router();

router.post(
  "/Admin/Register",
  registerAdmin
);

router.get(
  "/Admin/Users",
  authenticate,
  requireAdmin,
  listUsers
);

router.get(
  "/Admin/Users/ActivitySummary",
  authenticate,
  requireAdmin,
  listUserActivitySummary
);

router.get(
  "/Admin/Users/:id/Activities",
  authenticate,
  requireAdmin,
  getUserActivities
);

router.patch(
  "/Admin/Users/:id",
  authenticate,
  requireAdmin,
  updateUserStatus
);

router.delete(
  "/Admin/Users/:id",
  authenticate,
  requireAdmin,
  deleteUser
);

router.post(
  "/Admin/AdjustBalance",
  authenticate,
  requireAdmin,
  adjustUserBalance
);

router.get(
  "/Admin/Kyc",
  authenticate,
  requireAdmin,
  listKycSubmissions
);

router.get(
  "/Admin/Referrals",
  authenticate,
  requireAdmin,
  listReferralStats
);

router.get(
  "/Admin/Transactions",
  authenticate,
  requireAdmin,
  listTransactions
);

router.get(
  "/Admin/SystemMetrics",
  authenticate,
  requireAdmin,
  listSystemMetrics
);

router.get(
  "/Admin/Logs",
  authenticate,
  requireAdmin,
  listAdminLogs
);

router.post(
  "/Admin/Broadcast",
  authenticate,
  requireAdmin,
  broadcastAdminMessage
);

router.post(
  "/Admin/UpdateTransactionStatus",
  authenticate,
  requireAdmin,
  updateTransactionStatus
);

router.post(
  "/Admin/UpdateKycStatus",
  authenticate,
  requireAdmin,
  updateKycStatus
);

router.get(
  ["/Admin/Messages", "/Admin/Message"],
  authenticate,
  requireAdmin,
  listAdminThreads
);

router.get(
  ["/Admin/Messages/:threadId", "/Admin/Message/:threadId"],
  authenticate,
  requireAdmin,
  getAdminThread
);

router.post(
  ["/Admin/Messages/:threadId/Reply", "/Admin/Message/:threadId/Reply"],
  authenticate,
  requireAdmin,
  replyAdminThread
);

router.patch(
  ["/Admin/Messages/:threadId", "/Admin/Message/:threadId"],
  authenticate,
  requireAdmin,
  updateAdminThreadStatus
);

export default router;
