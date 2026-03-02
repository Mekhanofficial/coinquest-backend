import PaymentProof from "../models/PaymentProof.js";
import { asyncHandler } from "../utils/asyncHandler.js";

const toBase64WithPrefix = (file) => {
  if (!file) return "";
  const base64 = file.buffer.toString("base64");
  return `data:${file.mimetype};base64,${base64}`;
};

export const submitPaymentProof = asyncHandler(async (req, res) => {
  const amount = Number(req.body.amount);
  const reason = `${req.body.reason || ""}`.trim();

  if (!Number.isFinite(amount) || amount <= 0) {
    return res.status(400).json({
      success: false,
      message: "Valid amount is required",
    });
  }

  if (!reason) {
    return res.status(400).json({
      success: false,
      message: "Reason is required",
    });
  }

  let proofImage = "";
  if (req.file) {
    proofImage = toBase64WithPrefix(req.file);
  }

  if (!proofImage && req.body.proofImage) {
    proofImage = req.body.proofImage;
  }

  if (!proofImage) {
    return res.status(400).json({
      success: false,
      message: "Payment proof image is required",
    });
  }

  const proof = await PaymentProof.create({
    user: req.user._id,
    amount,
    reason,
    status: "Pending",
    proofImage,
    fileName: req.file?.originalname || "",
    mimeType: req.file?.mimetype || "",
    fileSize: req.file?.size || 0,
  });

  res.status(201).json({
    success: true,
    data: {
      id: proof._id.toString(),
      amount: proof.amount,
      reason: proof.reason,
      status: proof.status,
      createdAt: proof.createdAt,
    },
  });
});

export const listPaymentProofs = asyncHandler(async (req, res) => {
  const proofs = await PaymentProof.find({ user: req.user._id }).sort({
    createdAt: -1,
  });

  const data = proofs.map((proof) => ({
    id: proof._id.toString(),
    amount: proof.amount,
    reason: proof.reason,
    status: proof.status,
    createdAt: proof.createdAt,
  }));

  res.json({ success: true, data });
});
