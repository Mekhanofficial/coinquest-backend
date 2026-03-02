import PlaceTrade from "../models/PlaceTrade.js";
import { createFeatureController } from "./featureController.js";

export const placeTradeController = createFeatureController(PlaceTrade, {
  name: "PlaceTrade",
});
