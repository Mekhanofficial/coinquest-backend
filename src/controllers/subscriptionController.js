import Subscription from "../models/Subscription.js";
import { createFeatureController } from "./featureController.js";

export const subscriptionController = createFeatureController(Subscription, {
  name: "Subscription",
});
