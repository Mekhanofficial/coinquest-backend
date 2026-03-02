import Stake from "../models/Stake.js";
import { createFeatureController } from "./featureController.js";

export const stakeController = createFeatureController(Stake, {
  name: "Stake",
});
