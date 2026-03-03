import { Router } from "express";
import { authenticate } from "../middleware/auth.js";
import {
  listUserThreads,
  getUserThread,
  sendUserMessage,
} from "../controllers/supportMessageController.js";

const router = Router();

router.get(["/Message/Threads", "/Messages/Threads"], authenticate, listUserThreads);
router.get(
  ["/Message/Thread/:threadId", "/Messages/Thread/:threadId"],
  authenticate,
  getUserThread
);
router.post(["/Message/Send", "/Messages/Send"], authenticate, sendUserMessage);

export default router;
