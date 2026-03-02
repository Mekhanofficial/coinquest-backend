import BuyBot from "../models/BuyBot.js";
import { createFeatureController } from "./featureController.js";

export const buyBotController = createFeatureController(BuyBot, {
  name: "BuyBot",
});
