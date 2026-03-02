import RealEstate from "../models/RealEstate.js";
import { createFeatureController } from "./featureController.js";

export const realEstateController = createFeatureController(RealEstate, {
  name: "RealEstate",
});
