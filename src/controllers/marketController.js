import { asyncHandler } from "../utils/asyncHandler.js";

const DEFAULT_IDS = [
  "bitcoin",
  "ethereum",
  "cardano",
  "solana",
  "polkadot",
  "avalanche-2",
  "chainlink",
  "litecoin",
  "ripple",
];

const MAX_IDS = 50;
const CACHE_TTL_MS = 30 * 1000;

let priceCache = {
  key: "",
  expiresAt: 0,
  data: null,
};

const parseIds = (input) => {
  const value = `${input || ""}`
    .split(",")
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);
  const unique = [...new Set(value)];
  return unique.slice(0, MAX_IDS);
};

const parseVsCurrencies = (input) => {
  const value = `${input || "usd"}`
    .split(",")
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);
  const unique = [...new Set(value)];
  return unique.length ? unique.slice(0, 5) : ["usd"];
};

const fetchCoinGeckoPrices = async ({ ids, vsCurrencies, include24h }) => {
  const params = new URLSearchParams({
    ids: ids.join(","),
    vs_currencies: vsCurrencies.join(","),
  });

  if (include24h) {
    params.set("include_24hr_change", "true");
  }

  const url = `https://api.coingecko.com/api/v3/simple/price?${params.toString()}`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12000);

  try {
    const response = await fetch(url, {
      method: "GET",
      headers: {
        Accept: "application/json",
        "User-Agent": "coinquest-backend/1.0",
      },
      signal: controller.signal,
    });

    const raw = await response.text();
    let json = null;
    try {
      json = JSON.parse(raw);
    } catch {
      json = null;
    }

    if (!response.ok || !json || typeof json !== "object") {
      throw new Error(
        `CoinGecko request failed (${response.status}): ${raw?.slice(0, 160) || "No response body"}`
      );
    }

    return json;
  } finally {
    clearTimeout(timeout);
  }
};

export const getSimplePrices = asyncHandler(async (req, res) => {
  const ids = parseIds(req.query.ids);
  const vsCurrencies = parseVsCurrencies(req.query.vs_currencies);
  const include24h = `${req.query.include_24hr_change || ""}`.toLowerCase() === "true";

  const resolvedIds = ids.length ? ids : DEFAULT_IDS;
  const cacheKey = `${resolvedIds.join(",")}::${vsCurrencies.join(",")}::${include24h}`;

  if (
    priceCache.key === cacheKey &&
    priceCache.data &&
    Date.now() < priceCache.expiresAt
  ) {
    return res.json({
      success: true,
      data: priceCache.data,
      source: "coingecko",
      cached: true,
      ids: resolvedIds,
    });
  }

  const data = await fetchCoinGeckoPrices({
    ids: resolvedIds,
    vsCurrencies,
    include24h,
  });

  priceCache = {
    key: cacheKey,
    data,
    expiresAt: Date.now() + CACHE_TTL_MS,
  };

  return res.json({
    success: true,
    data,
    source: "coingecko",
    cached: false,
    ids: resolvedIds,
  });
});
