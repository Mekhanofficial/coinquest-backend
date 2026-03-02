import Mining from "../models/Mining.js";
import { createFeatureController } from "./featureController.js";

export const miningController = createFeatureController(Mining, {
  name: "Mining",
});
