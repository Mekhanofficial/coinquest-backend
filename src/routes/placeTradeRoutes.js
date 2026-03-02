import { Router } from "express";
import { placeTradeController } from "../controllers/placeTradeController.js";
import { authenticate } from "../middleware/auth.js";

const router = Router();

router.post("/PlaceTrade/Create", authenticate, placeTradeController.create);
router.get("/PlaceTrade", authenticate, placeTradeController.list);
router.get("/PlaceTrade/:id", authenticate, placeTradeController.getById);
router.patch("/PlaceTrade/:id", authenticate, placeTradeController.update);
router.delete("/PlaceTrade/:id", authenticate, placeTradeController.remove);

export default router;
