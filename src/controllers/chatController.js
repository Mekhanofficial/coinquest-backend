import Transaction from "../models/Transaction.js";
import { asyncHandler } from "../utils/asyncHandler.js";

const BASE_TOKEN_PRICES = {
  BTC: 62850,
  ETH: 3450,
  SOL: 150,
  ADA: 0.48,
  DOGE: 0.15,
};

const DEFAULT_SUGGESTIONS = [
  "What's Bitcoin price?",
  "Show my portfolio summary",
  "How do deposits work here?",
  "Show project modules",
];

const ROUTE_SUGGESTIONS = [
  "Where is Place Trade?",
  "How to verify KYC?",
  "How to submit payment proof?",
  "Where are referral stats?",
];

const NEWS_SUGGESTIONS = [
  "Show BTC vs ETH outlook",
  "Summarize market risk today",
  "How should I manage volatility?",
];

const SUBSCRIPTION_PLANS = [
  "Basic: Free | ROI 2.00%",
  "Standard: $2,500 | ROI 5.00% | 1 day",
  "Premium: $4,000 | ROI 30.00% | 5 days",
  "Platinum: $10,000 | ROI 15.00% | 3 days",
  "Elite: $25,000 | ROI 55.00% | 7 days",
];

const SIGNAL_PLANS = [
  "Learn II Trade: $9,899 | win rate 85% | 3 signals/day",
  "AVA TRADE: $4,999 | win rate 78% | 2 signals/day",
  "RoboForex: $2,899 | win rate 72% | 4 signals/day",
  "ZERO TO HERO: $15,988 | win rate 90% | 5 signals/day",
  "1000 PIPS: $1,500 | win rate 65% | 1 signal/day",
  "WeTalkTrade: $10,900 | win rate 82% | 3 signals/day",
];

const BOT_OFFERINGS = [
  "3COMMAS ($750)",
  "CRYPTOHOPPER ($1,000)",
  "TRADINGVIEW ($600)",
  "ZIGNALY ($900)",
  "SHRIMMPY ($1,200)",
  "COINRULE ($500)",
  "TRADEBOT ($850)",
  "BITUNIVERSE ($1,100)",
];

const STAKING_ASSETS = [
  "BTC (APY 5.2%)",
  "ETH (6.8%)",
  "ADA (4.5%)",
  "SOL (7.2%)",
  "DOT (8.1%)",
  "AVAX (6.5%)",
  "LINK (5.9%)",
  "LTC (4.8%)",
  "XRP (3.7%)",
];

const REAL_ESTATE_DEALS = [
  "Hilton Philadelphia City Avenue (min $33,000)",
  "Fabian Labs, Palo Alto (min $24,000)",
  "Go Store It Nashville (min $15,000)",
  "The Mirage - Texas State Student Housing (min $32,500)",
  "Palmetto Industrial Park (min $25,000)",
  "Bridge Labs at Pegasus Park (min $12,000)",
];

const formatCurrency = (value, currencyCode = "USD") => {
  const numeric = Number(value);
  const safeValue = Number.isFinite(numeric) ? numeric : 0;

  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: currencyCode || "USD",
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(safeValue);
  } catch (error) {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(safeValue);
  }
};

const normalizeCurrency = (value) => {
  if (!value || typeof value !== "string") return "USD";
  return value.trim().toUpperCase() || "USD";
};

const resolveSymbol = (query = "") => {
  const lowered = query.toLowerCase();
  if (lowered.includes("bitcoin") || lowered.includes("btc")) return "BTC";
  if (lowered.includes("ethereum") || lowered.includes("eth")) return "ETH";
  if (lowered.includes("solana") || lowered.includes("sol")) return "SOL";
  if (lowered.includes("cardano") || lowered.includes("ada")) return "ADA";
  if (lowered.includes("dogecoin") || lowered.includes("doge")) return "DOGE";
  return "BTC";
};

const computeSyntheticPrice = (symbol, seedText) => {
  const base = BASE_TOKEN_PRICES[symbol] || 1000;
  const seed = `${seedText || ""}${symbol}`
    .split("")
    .reduce((total, char) => total + char.charCodeAt(0), 0);
  const timeBucket = Math.floor(Date.now() / 60000);
  const deltaRatio = Math.sin((timeBucket + seed) * 0.37) * 0.028;
  const price = base * (1 + deltaRatio);

  return {
    price: Number(price.toFixed(2)),
    changePct: Number((deltaRatio * 100).toFixed(2)),
  };
};

const summarizeTransactions = (transactions = []) => {
  const pendingCount = transactions.filter(
    (tx) => `${tx.status}`.toLowerCase() === "pending"
  ).length;
  const completedCount = transactions.filter(
    (tx) => `${tx.status}`.toLowerCase() === "completed"
  ).length;
  const lastTransaction = transactions[0] || null;

  return {
    pendingCount,
    completedCount,
    totalCount: transactions.length,
    lastTransaction,
  };
};

const formatLastTransaction = (transaction, fallbackCurrency = "USD") => {
  if (!transaction) return "No transactions recorded yet.";

  const txCurrency = normalizeCurrency(transaction.currency || fallbackCurrency);
  const txAmount = formatCurrency(transaction.amount, txCurrency);
  return `${transaction.type} ${txAmount} (${transaction.status})`;
};

const buildPriceReply = (query) => {
  const symbol = resolveSymbol(query);
  const { price, changePct } = computeSyntheticPrice(symbol, query);
  const direction = changePct >= 0 ? "up" : "down";

  return {
    topic: "price",
    reply:
      `${symbol} is ${formatCurrency(price, "USD")} ` +
      `(${Math.abs(changePct).toFixed(2)}% ${direction} in 24h).\n\n` +
      "Ask me to compare BTC vs ETH or map this to your account risk.",
    suggestions: [
      "Compare BTC vs ETH",
      "How is my portfolio doing?",
      "How do I place a trade?",
    ],
  };
};

const buildPortfolioReply = (user, txSummary) => {
  if (!user) {
    return {
      topic: "portfolio",
      reply:
        "Portfolio insights are available after login. Sign in and I will show your balance, pending transactions, and account pulse.",
      suggestions: DEFAULT_SUGGESTIONS,
    };
  }

  const currencyCode = normalizeCurrency(user.currencyCode);
  const balance = formatCurrency(user.balance, currencyCode);
  const lastTx = formatLastTransaction(txSummary.lastTransaction, currencyCode);

  return {
    topic: "portfolio",
    reply:
      "Portfolio summary:\n" +
      `- Balance: ${balance}\n` +
      `- Currency: ${currencyCode}\n` +
      `- Pending transactions: ${txSummary.pendingCount}\n` +
      `- Completed transactions: ${txSummary.completedCount}\n` +
      `- Last transaction: ${lastTx}\n\n` +
      "I can break this down by deposits, withdrawals, or active trades next.",
    suggestions: [
      "Show my account pulse",
      "How do deposits work here?",
      "How do withdrawals work here?",
    ],
  };
};

const buildProjectPulseReply = (user, txSummary) => {
  if (!user) {
    return {
      topic: "project",
      reply:
        "Sign in to get your account pulse with live balance, plan, and transaction status.",
      suggestions: DEFAULT_SUGGESTIONS,
    };
  }

  const currencyCode = normalizeCurrency(user.currencyCode);
  const balance = formatCurrency(user.balance, currencyCode);
  const lastTx = formatLastTransaction(txSummary.lastTransaction, currencyCode);

  return {
    topic: "project",
    reply:
      "Account pulse:\n" +
      `- Balance: ${balance}\n` +
      `- Plan: ${user.subscriptionPlan || "Basic"}\n` +
      `- KYC: ${user.kycVerified ? "Verified" : user.kycStatus || "Pending"}\n` +
      `- Pending transactions: ${txSummary.pendingCount}\n` +
      `- Last transaction: ${lastTx}`,
    suggestions: [
      "Show my portfolio summary",
      "Where is KYC verification?",
      "How do transactions work?",
    ],
  };
};

const buildTransactionReply = (user, txSummary) => {
  if (!user) {
    return {
      topic: "transactions",
      reply:
        "Sign in to check transaction history and statuses. Once logged in, I can show pending and completed activity.",
      suggestions: DEFAULT_SUGGESTIONS,
    };
  }

  const currencyCode = normalizeCurrency(user.currencyCode);
  const lastTx = formatLastTransaction(txSummary.lastTransaction, currencyCode);

  return {
    topic: "transactions",
    reply:
      "Transaction status snapshot:\n" +
      `- Pending: ${txSummary.pendingCount}\n` +
      `- Completed: ${txSummary.completedCount}\n` +
      `- Total tracked: ${txSummary.totalCount}\n` +
      `- Most recent: ${lastTx}`,
    suggestions: [
      "How do deposits work here?",
      "How do withdrawals work here?",
      "How to submit payment proof?",
    ],
  };
};

const buildNewsReply = () => ({
  topic: "news",
  reply:
    "Market update:\n" +
    "1. Bitcoin remains range-bound while spot demand stays active.\n" +
    "2. Ethereum L2 activity remains elevated as usage expands.\n" +
    "3. Stablecoin transfer volume remains a key liquidity signal.\n\n" +
    "I can give you a short bullish vs bearish scenario next.",
  suggestions: NEWS_SUGGESTIONS,
});

const buildPlatformOverviewReply = (user) => {
  const currencyCode = normalizeCurrency(user?.currencyCode || "USD");

  return {
    topic: "project_overview",
    reply:
      "Coinquest project modules:\n" +
      "- Dashboard: balance, KYC status, active trades, performance cards, quick actions.\n" +
      "- Wallet flow: Deposit, Withdrawal, Payment Proof, Transaction History.\n" +
      "- Trading: Place Trade, Copy Trade, Trades/ROI, Buy Crypto.\n" +
      "- Products: Subscription plans, Daily Signals, AI Bots, Mining, Staking, Real Estate.\n" +
      "- Account: Profile, Verify Account (KYC), email/password/photo updates.\n" +
      "- Utility: Referrals, Help Center, Watchlist, Messages.\n\n" +
      `Your account display currency is ${currencyCode}.`,
    suggestions: [
      "Show dashboard features",
      "Show subscription plans",
      "Show daily signal plans",
      "Show API/backend endpoints",
    ],
  };
};

const buildNavigationReply = () => ({
  topic: "navigation",
  reply:
    "Main sidebar routes:\n" +
    "- Dashboard, Assets, Deposit, Withdraw, Payment Proof, Transactions, Referral\n" +
    "- Place Trade, Subscription, Copy Trade, Daily Signal, Buy Bots, Mining, Stake, Real Estate, Trades/ROI, Buy Crypto\n" +
    "- Account, Verify Account, Settings, Messages, Watchlist, Help",
  suggestions: ROUTE_SUGGESTIONS,
});

const buildAccountSettingsReply = (user) => ({
  topic: "account",
  reply:
    "Account module includes:\n" +
    "- Profile overview with balance and portfolio stats\n" +
    "- Verify Account (KYC)\n" +
    "- Update photo, email, password, and settings pages\n" +
    `- Current account currency: ${normalizeCurrency(user?.currencyCode || "USD")}`,
  suggestions: [
    "How do I verify KYC?",
    "How do deposits work here?",
    "How do withdrawals work here?",
  ],
});

const buildKycReply = (user) => ({
  topic: "kyc",
  reply:
    "KYC flow:\n" +
    "- Go to Verify Account / KYC Verification page\n" +
    "- Upload government ID and selfie (JPEG/PNG, max 5MB each)\n" +
    "- After submit, status is synced from backend dashboard\n" +
    `- Current KYC status: ${
      user
        ? user.kycVerified
          ? "verified"
          : user.kycStatus || "not_verified"
        : "sign in required to view"
    }`,
  suggestions: [
    "What does KYC unlock?",
    "How do deposits work here?",
    "How do withdrawals work here?",
  ],
});

const buildDepositReply = (user) => ({
  topic: "deposit",
  reply:
    "Deposit module details:\n" +
    "- Route: Deposit\n" +
    "- Minimum amount: $10\n" +
    "- Supported assets in UI: BTC, ETH, SOL, BASE, SUI, POL\n" +
    "- Backend endpoints: /Deposit/Methods and /Deposit/Create\n" +
    "- KYC verification is required before creating deposits",
  suggestions: [
    "How do withdrawals work here?",
    "How to submit payment proof?",
    user ? "Show my transaction status" : "How do I verify KYC?",
  ],
});

const buildWithdrawalReply = (user) => ({
  topic: "withdrawal",
  reply:
    "Withdrawal module details:\n" +
    "- Route: Withdraw\n" +
    "- Minimum amount: $10\n" +
    "- Methods: Bank Transfer, Crypto, Cash App, PayPal, Skrill\n" +
    "- Backend endpoint: /Withdrawal/Create\n" +
    "- KYC verification is required",
  suggestions: [
    "How do deposits work here?",
    "How to submit payment proof?",
    user ? "Show my transaction status" : "How do I verify KYC?",
  ],
});

const buildPaymentProofReply = () => ({
  topic: "payment_proof",
  reply:
    "Payment Proof module:\n" +
    "- Upload image proof for transaction verification\n" +
    "- Allowed format: image files up to 5MB\n" +
    "- Backend endpoints: /PaymentProof and /PaymentProof/Submit\n" +
    "- Statuses are shown as Pending/Completed/Failed",
  suggestions: [
    "How do deposits work here?",
    "How do transactions work?",
    "How do withdrawals work here?",
  ],
});

const buildPlaceTradeReply = () => ({
  topic: "place_trade",
  reply:
    "Place Trade module:\n" +
    "- Trade types: VIP Trades, Crypto, Forex\n" +
    "- Direction: Buy or Sell\n" +
    "- Inputs: amount, lot size, take-profit, stop-loss, duration\n" +
    "- Backend endpoints: /PlaceTrade and /PlaceTrade/Create",
  suggestions: [
    "Show dashboard features",
    "How do copy trades work?",
    "How do subscription plans work?",
  ],
});

const buildCopyTradeReply = () => ({
  topic: "copy_trade",
  reply:
    "Copy Trade flow:\n" +
    "- Use MyTraders to start copying traders\n" +
    "- Use My Copy Traders to manage and settle copied positions\n" +
    "- Backend endpoints: /CopyTrade and /CopyTrade/Create\n" +
    "- Settled positions update account balance",
  suggestions: [
    "Show dashboard features",
    "How do transactions work?",
    "How do referrals work?",
  ],
});

const buildSubscriptionReply = (user) => ({
  topic: "subscription",
  reply:
    "Subscription plans in project:\n" +
    `${SUBSCRIPTION_PLANS.map((item) => `- ${item}`).join("\n")}\n\n` +
    `Current plan: ${user?.subscriptionPlan || "sign in to view"}`,
  suggestions: [
    "Show daily signal plans",
    "Show bot offerings",
    "How do deposits work here?",
  ],
});

const buildSignalReply = () => ({
  topic: "signal",
  reply:
    "Daily Signal offerings:\n" +
    `${SIGNAL_PLANS.map((item) => `- ${item}`).join("\n")}`,
  suggestions: [
    "Show subscription plans",
    "Show bot offerings",
    "How do transactions work?",
  ],
});

const buildBotsReply = () => ({
  topic: "bots",
  reply:
    "AI bot offerings in project:\n" +
    `${BOT_OFFERINGS.map((item) => `- ${item}`).join("\n")}\n\n` +
    "Bots can be activated/deactivated from Buy Bots and logged in transactions.",
  suggestions: [
    "Show daily signal plans",
    "How does mining work?",
    "How do transactions work?",
  ],
});

const buildMiningReply = () => ({
  topic: "mining",
  reply:
    "Mining module details:\n" +
    "- Supported coins: BTC, ETH, LTC, DOGE, SOL\n" +
    "- Configurable hash rate per miner\n" +
    "- Cycle-based earnings settlement\n" +
    "- Purchased bots can boost mining efficiency",
  suggestions: [
    "Show staking assets",
    "Show bot offerings",
    "How do transactions work?",
  ],
});

const buildStakingReply = () => ({
  topic: "staking",
  reply:
    "Staking assets in project:\n" +
    `${STAKING_ASSETS.map((item) => `- ${item}`).join("\n")}\n\n` +
    "Staking positions track duration, reward accrual, and maturity settlement.",
  suggestions: [
    "How does mining work?",
    "Show subscription plans",
    "How do transactions work?",
  ],
});

const buildRealEstateReply = () => ({
  topic: "real_estate",
  reply:
    "Real Estate offerings in project:\n" +
    `${REAL_ESTATE_DEALS.map((item) => `- ${item}`).join("\n")}`,
  suggestions: [
    "How do transactions work?",
    "How do referrals work?",
    "Show project modules",
  ],
});

const buildReferralReply = (user) => ({
  topic: "referral",
  reply:
    "Referral module details:\n" +
    "- Backend endpoint: /Referral/Overview\n" +
    "- Tracks total referrals, active referrals, and earnings\n" +
    "- Includes share actions for social channels\n" +
    `- Account currency: ${normalizeCurrency(user?.currencyCode || "USD")}`,
  suggestions: [
    "How do transactions work?",
    "Show dashboard features",
    "Show project modules",
  ],
});

const buildBuyCryptoReply = () => ({
  topic: "buy_crypto",
  reply:
    "Buy Crypto page links to partner exchanges:\n" +
    "- Binance\n- Bitcoin.com\n- Coinbase\n- Crypto.com\n- Gemini\n- Kraken",
  suggestions: [
    "How do deposits work here?",
    "Show place trade details",
    "Show project modules",
  ],
});

const buildMessagesWatchlistHelpReply = () => ({
  topic: "utility",
  reply:
    "Utility pages:\n" +
    "- Messages: system updates and trader alerts\n" +
    "- Watchlist: tracks favorite markets and alerts\n" +
    "- Help Center: guides for KYC, deposits, trading, and support",
  suggestions: [
    "How do I verify KYC?",
    "How do deposits work here?",
    "Show project modules",
  ],
});

const buildAdminReply = () => ({
  topic: "admin",
  reply:
    "Admin modules include:\n" +
    "- Admin dashboard and auth pages\n" +
    "- User and transaction management\n" +
    "- KYC review and finance/security tools\n" +
    "- Backend admin routes under /Admin/*",
  suggestions: [
    "Show API/backend endpoints",
    "Show project modules",
    "How do transactions work?",
  ],
});

const buildApiReply = (isAuthenticated) => ({
  topic: "api",
  reply:
    "Backend integration highlights:\n" +
    "- Auth: /User/Register, /Authentication/Login, /User/Logout\n" +
    "- User: /User/Dashboard, /User/Profile, /User/KycStatus, /User/Balance\n" +
    "- Wallet: /Deposit/Methods, /Deposit/Create, /Withdrawal/Create\n" +
    "- Activity: /Transaction/History, /Transaction/Create, /PaymentProof, /PaymentProof/Submit\n" +
    "- Trading: /PlaceTrade, /PlaceTrade/Create, /CopyTrade, /Trade, /Subscription, /Signal, /BuyBot, /Mining, /Stake, /RealEstate\n" +
    "- Referrals: /Referral/Overview\n" +
    "- Chat: /Chat/Reply",
  suggestions: isAuthenticated
    ? [
        "Show my portfolio summary",
        "How do deposits work here?",
        "How do transactions work?",
      ]
    : ["How do I log in?", "Show project modules", "How do deposits work here?"],
});

const buildHelpReply = (isAuthenticated) => ({
  topic: "help",
  reply:
    "I can help with:\n" +
    "- Price checks (BTC, ETH, SOL, ADA, DOGE)\n" +
    "- Dashboard and account flows\n" +
    "- Deposit, withdrawal, payment proof, and transaction status\n" +
    "- Place trade, copy trade, subscription, signals, bots, mining, staking, real-estate, referrals\n" +
    "- Route and backend endpoint guidance\n\n" +
    (isAuthenticated
      ? "Try: 'show my portfolio summary' or 'how do deposits work here?'."
      : "Try: 'show project modules' or sign in for account-specific answers."),
  suggestions: [
    "Show project modules",
    "Show subscription plans",
    "How do deposits work here?",
    "Show API/backend endpoints",
  ],
});

const buildFallbackReply = () => ({
  topic: "fallback",
  reply:
    "I can answer coinquest project and crypto questions. Try:\n" +
    "- Show project modules\n" +
    "- How do deposits work here?\n" +
    "- Show subscription plans\n" +
    "- How do copy trades work?\n" +
    "- Show API/backend endpoints",
  suggestions: DEFAULT_SUGGESTIONS,
});

const buildProjectKnowledgeReply = (query, user) => {
  if (
    /about this project|about coinquest|project details|project modules|platform features|what can this app do|what can this project do|coinquest features|full project/i.test(
      query
    )
  ) {
    return buildPlatformOverviewReply(user);
  }

  if (/route|navigate|where is|where can i find|sidebar menu|open page/i.test(query)) {
    return buildNavigationReply();
  }

  if (/subscription|elite|platinum|premium|standard plan|basic plan|investment plan/i.test(query)) {
    return buildSubscriptionReply(user);
  }

  if (/signal service|daily signal|learn ii trade|ava trade|roboforex|zero to hero|1000 pips|wetalktrade/i.test(query)) {
    return buildSignalReply();
  }

  if (/buy bot|ai bot|trading bot|3commas|cryptohopper|zignaly|shrimmpy|coinrule|tradebot|bituniverse/i.test(query)) {
    return buildBotsReply();
  }

  if (/mining|miner|hashrate|hash rate|fleet boost/i.test(query)) {
    return buildMiningReply();
  }

  if (/staking|stake assets|apy|lock period|validator/i.test(query)) {
    return buildStakingReply();
  }

  if (/real estate|property investment|hilton philadelphia|fabian labs|go store|mirage|palmetto|bridge labs/i.test(query)) {
    return buildRealEstateReply();
  }

  if (/referral|invite friends|referral overview|commission/i.test(query)) {
    return buildReferralReply(user);
  }

  if (/buy crypto|binance|coinbase|crypto.com|gemini|kraken|bitcoin.com/i.test(query)) {
    return buildBuyCryptoReply();
  }

  if (/place trade|vip trades|forex|take profit|stop loss|lot size|trade duration/i.test(query)) {
    return buildPlaceTradeReply();
  }

  if (/copy trade|copy trader|my traders|my copy traders/i.test(query)) {
    return buildCopyTradeReply();
  }

  if (/deposit|fund account|wallet address|deposit method|deposit page/i.test(query)) {
    return buildDepositReply(user);
  }

  if (/withdraw|cash app|paypal|skrill|bank transfer|withdrawal page/i.test(query)) {
    return buildWithdrawalReply(user);
  }

  if (/payment proof|proof of payment|receipt upload/i.test(query)) {
    return buildPaymentProofReply();
  }

  if (/kyc|verify account|identity verification|government id|selfie/i.test(query)) {
    return buildKycReply(user);
  }

  if (/account settings|profile|update photo|change password|change email|settings page/i.test(query)) {
    return buildAccountSettingsReply(user);
  }

  if (/messages|watchlist|help center|support page/i.test(query)) {
    return buildMessagesWatchlistHelpReply();
  }

  if (/admin|admin dashboard|admin tools|kyc review|admin transaction/i.test(query)) {
    return buildAdminReply();
  }

  if (/api|backend|endpoint|integration|connect backend|server routes/i.test(query)) {
    return buildApiReply(Boolean(user));
  }

  return null;
};

const buildChatResponse = (query, user, txSummary) => {
  const normalized = `${query || ""}`.trim().toLowerCase();

  if (!normalized) {
    return buildFallbackReply();
  }

  if (
    /price|btc|bitcoin|eth|ethereum|sol|solana|ada|cardano|doge|dogecoin/.test(
      normalized
    )
  ) {
    return buildPriceReply(normalized);
  }

  if (/portfolio|balance|wallet|holdings/.test(normalized)) {
    return buildPortfolioReply(user, txSummary);
  }

  if (/news|market|trend|headline|update/.test(normalized)) {
    return buildNewsReply();
  }

  const projectReply = buildProjectKnowledgeReply(normalized, user, txSummary);
  if (projectReply) {
    return projectReply;
  }

  if (/project|pulse|account status|snapshot/.test(normalized)) {
    return buildProjectPulseReply(user, txSummary);
  }

  if (/transaction|history|pending status|payment status/.test(normalized)) {
    return buildTransactionReply(user, txSummary);
  }

  if (/help|support|what can you do|assist/.test(normalized)) {
    return buildHelpReply(Boolean(user));
  }

  return buildFallbackReply();
};

export const getChatReply = asyncHandler(async (req, res) => {
  const message = `${req.body.message || req.body.query || ""}`.trim();
  if (!message) {
    return res.status(400).json({
      success: false,
      message: "Message is required",
    });
  }

  if (message.length > 800) {
    return res.status(400).json({
      success: false,
      message: "Message is too long",
    });
  }

  const user = req.user || null;
  let recentTransactions = [];

  if (user?._id) {
    recentTransactions = await Transaction.find({ user: user._id })
      .sort({ createdAt: -1 })
      .limit(12);
  }

  const txSummary = summarizeTransactions(recentTransactions);
  const response = buildChatResponse(message, user, txSummary);

  return res.json({
    success: true,
    data: {
      topic: response.topic,
      reply: response.reply,
      suggestions: response.suggestions,
      isAuthenticated: Boolean(user),
      timestamp: new Date().toISOString(),
    },
  });
});
