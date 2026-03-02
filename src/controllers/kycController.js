import Kyc from "../models/Kyc.js";
import { env } from "../config/env.js";
import { asyncHandler } from "../utils/asyncHandler.js";

const toBase64WithPrefix = (file) => {
  if (!file) return "";
  const base64 = file.buffer.toString("base64");
  return `data:${file.mimetype};base64,${base64}`;
};

export const submitKyc = asyncHandler(async (req, res) => {
  let governmentId = "";
  let selfie = "";

  if (req.files?.GovernmentIssuedId?.[0]) {
    governmentId = toBase64WithPrefix(req.files.GovernmentIssuedId[0]);
  }

  if (req.files?.SelfieWithId?.[0]) {
    selfie = toBase64WithPrefix(req.files.SelfieWithId[0]);
  }

  if (!governmentId && req.body.GovernmentIssuedId) {
    governmentId = req.body.GovernmentIssuedId;
  }

  if (!selfie && req.body.SelfieWithId) {
    selfie = req.body.SelfieWithId;
  }

  if (!governmentId || !selfie) {
    return res.status(400).json({
      success: false,
      message: "GovernmentIssuedId and SelfieWithId are required",
    });
  }

  const status = env.AUTO_VERIFY_KYC ? "verified" : "pending";

  const kyc = await Kyc.findOneAndUpdate(
    { user: req.user._id },
    {
      user: req.user._id,
      email: req.body.Email || req.user.email,
      status,
      governmentId,
      selfie,
      submittedAt: new Date(),
    },
    { upsert: true, new: true }
  );

  req.user.kycStatus = status === "verified" ? "verified" : "pending";
  req.user.kycVerified = status === "verified";
  await req.user.save();

  res.json({
    success: true,
    data: {
      id: kyc._id.toString(),
      status: req.user.kycStatus,
      verified: req.user.kycVerified,
    },
  });
});
