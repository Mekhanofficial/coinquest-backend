import Signal from "../models/Signal.js";
import { createFeatureController } from "./featureController.js";

export const signalController = createFeatureController(Signal, {
  name: "Signal",
});
