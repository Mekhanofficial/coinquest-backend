import { Router } from "express";
import multer from "multer";
import { submitKyc } from "../controllers/kycController.js";
import { authenticate } from "../middleware/auth.js";

const router = Router();
const upload = multer({
  limits: { fileSize: 5 * 1024 * 1024 },
});

router.post(
  "/Kyc/Submit",
  authenticate,
  upload.fields([
    { name: "GovernmentIssuedId", maxCount: 1 },
    { name: "SelfieWithId", maxCount: 1 },
  ]),
  submitKyc
);

export default router;
