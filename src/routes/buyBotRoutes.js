import { Router } from "express";
import { buyBotController } from "../controllers/buyBotController.js";
import { authenticate } from "../middleware/auth.js";

const router = Router();

router.post("/BuyBot/Create", authenticate, buyBotController.create);
router.get("/BuyBot", authenticate, buyBotController.list);
router.get("/BuyBot/:id", authenticate, buyBotController.getById);
router.patch("/BuyBot/:id", authenticate, buyBotController.update);
router.delete("/BuyBot/:id", authenticate, buyBotController.remove);

export default router;
