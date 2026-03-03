import dotenv from "dotenv";
import process from "node:process";

dotenv.config();

const defaultCorsOrigins = ["http://localhost:5173", "http://localhost:5174"];
const parsedCorsOrigins = (
  process.env.CORS_ORIGINS ||
  process.env.CORS_ORIGIN ||
  defaultCorsOrigins.join(",")
)
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

export const env = {
  PORT: process.env.PORT ? Number(process.env.PORT) : 5000,
  MONGODB_URI:
    process.env.MONGODB_URI || "mongodb://localhost:27017/coinquest",
  JWT_SECRET: process.env.JWT_SECRET || "change_me",
  CORS_ORIGINS: parsedCorsOrigins,
  CORS_ORIGIN: parsedCorsOrigins[0] || "http://localhost:5173",
  FRONTEND_URL:
    process.env.FRONTEND_URL ||
    process.env.APP_BASE_URL ||
    parsedCorsOrigins[0] ||
    "http://localhost:5173",
  REFERRAL_BONUS: process.env.REFERRAL_BONUS
    ? Number(process.env.REFERRAL_BONUS)
    : 25,
  REQUIRE_KYC: process.env.REQUIRE_KYC === "true",
  REQUIRE_ADMIN: process.env.REQUIRE_ADMIN === "true",
  AUTO_VERIFY_KYC: process.env.AUTO_VERIFY_KYC === "true",
  ADMIN_AUTH_CODE: process.env.ADMIN_AUTH_CODE || "",
  RESET_TOKEN_TTL_MINUTES: process.env.RESET_TOKEN_TTL_MINUTES
    ? Number(process.env.RESET_TOKEN_TTL_MINUTES)
    : 60,
  COINGECKO_API_KEY: process.env.COINGECKO_API_KEY || "",
  COINGECKO_PRO_API_KEY: process.env.COINGECKO_PRO_API_KEY || "",
};
