import { Router } from "express";
import {
  updateTransactionStatus,
  updateKycStatus,
  registerAdmin,
  listUsers,
  updateUserStatus,
  deleteUser,
  adjustUserBalance,
  listKycSubmissions,
  listTransactions,
} from "../controllers/adminController.js";
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
  "/Admin/Transactions",
  authenticate,
  requireAdmin,
  listTransactions
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

export default router;
