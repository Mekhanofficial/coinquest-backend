import CopyTrade from "../models/CopyTrade.js";
import { createFeatureController } from "./featureController.js";

export const copyTradeController = createFeatureController(CopyTrade, {
  name: "CopyTrade",
});
