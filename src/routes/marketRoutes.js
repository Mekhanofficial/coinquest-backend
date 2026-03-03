import { Router } from "express";
import { getSimplePrices } from "../controllers/marketController.js";

const router = Router();

router.get("/Market/Prices", getSimplePrices);

export default router;
