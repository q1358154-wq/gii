const INFO_URL = "https://api.hyperliquid.xyz/info";
const DEEPSEEK_URL = "https://api.deepseek.com/chat/completions";

const AI_CACHE_MS = 30_000;

let aiCache = null;
let aiCacheAt = 0;
let aiUpdating = null;

async function request(body) {
  const response = await fetch(INFO_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`Hyperliquid HTTP ${response.status}`);
  }

  return response.json();
}

function n(value) {
  const result = Number(value);
  return Number.isFinite(result) ? result : 0;
}

function average(values) {
  if (!values.length) return 0;

  return (
    values.reduce((sum, value) => sum + value, 0) /
    values.length
  );
}

async function collectMarket() {
  const [mids, candles, book, trades] =
    await Promise.all([
      request({
        type: "allMids",
      }),

      request({
        type: "candleSnapshot",
        req: {
          coin: "HYPE",
          interval: "5m",
          startTime: Date.now() - 6 * 60 * 60 * 1000,
          endTime: Date.now(),
        },
      }),

      request({
        type: "l2Book",
        coin: "HYPE",
      }),

      request({
        type: "recentTrades",
        coin: "HYPE",
      }),
    ]);

  const price = n(mids?.HYPE);

  const candleRows = Array.isArray(candles)
    ? candles
        .map((item) => ({
          open: n(item?.o),
          high: n(item?.h),
          low: n(item?.l),
          close: n(item?.c),
          volume: n(item?.v),
          time: n(item?.t),
        }))
        .filter((item) => item.close > 0)
    : [];

  const closes = candleRows.map((item) => item.close);

  const recent = closes.slice(-12);
  const previous = closes.slice(-24, -12);

  const recentAverage = average(recent);
  const previousAverage = average(previous);

  const trend =
    previousAverage > 0
      ? ((recentAverage - previousAverage) / previousAverage) * 100
      : 0;

  const levels = book?.levels || [];

  const bids = Array.isArray(levels[0]) ? levels[0] : [];
  const asks = Array.isArray(levels[1]) ? levels[1] : [];

  const bidDepth = bids.reduce(
    (sum, item) => sum + n(item?.px) * n(item?.sz),
    0
  );

  const askDepth = asks.reduce(
    (sum, item) => sum + n(item?.px) * n(item?.sz),
    0
  );

  const totalDepth = bidDepth + askDepth;

  const bookImbalance =
    totalDepth > 0
      ? (bidDepth - askDepth) / totalDepth
      : 0;

  const tradeRows = Array.isArray(trades) ? trades : [];

  let buyVolume = 0;
  let sellVolume = 0;

  for (const trade of tradeRows) {
    const size = n(trade?.sz);

    if (trade?.side === "B") {
      buyVolume += size;
    }

    if (trade?.side === "A") {
      sellVolume += size;
    }
  }

  const totalFlow = buyVolume + sellVolume;

  const flowImbalance =
    totalFlow > 0
      ? (buyVolume - sellVolume) / totalFlow
      : 0;

  return {
    price,
    trend,
    bookImbalance,
    bidDepth,
    askDepth,
    buyVolume,
    sellVolume,
    flowImbalance,
    tradeCount: tradeRows.length,
  };
}

function marketAgent(data) {
  if (data.trend > 0.35) {
    return {
      state: "positive",
      summary: `Short-term structure is supportive. The recent 1-hour average is ${data.trend.toFixed(
        2
      )}% above the previous window.`,
    };
  }

  if (data.trend < -0.75) {
    return {
      state: "warning",
      summary: `Short-term structure is weakening. The recent 1-hour average is ${Math.abs(
        data.trend
      ).toFixed(2)}% below the previous window.`,
    };
  }

  return {
    state: "normal",
    summary: `Market structure is mixed. Average-window change is ${data.trend.toFixed(
      2
    )}%.`,
  };
}

function liquidityAgent(data) {
  if (data.bookImbalance > 0.12) {
    return {
      state: "positive",
      summary: `Bid-side liquidity is stronger. Book imbalance is +${(
        data.bookImbalance * 100
      ).toFixed(1)}%.`,
    };
  }

  if (data.bookImbalance < -0.12) {
    return {
      state: "warning",
      summary: `Ask-side liquidity is stronger. Book imbalance is ${(
        data.bookImbalance * 100
      ).toFixed(1)}%.`,
    };
  }

  return {
    state: "normal",
    summary: `Order-book liquidity is relatively balanced. Imbalance is ${(
      data.bookImbalance * 100
    ).toFixed(1)}%.`,
  };
}

function flowAgent(data) {
  if (data.flowImbalance > 0.15) {
    return {
      state: "positive",
      summary: `Recent taker flow is buy-dominant. Flow imbalance is +${(
        data.flowImbalance * 100
      ).toFixed(1)}%.`,
    };
  }

  if (data.flowImbalance < -0.15) {
    return {
      state: "warning",
      summary: `Recent taker flow is sell-dominant. Flow imbalance is ${(
        data.flowImbalance * 100
      ).toFixed(1)}%.`,
    };
  }

  return {
    state: "normal",
    summary: `Recent taker flow is mixed. Flow imbalance is ${(
      data.flowImbalance * 100
    ).toFixed(1)}%.`,
  };
}

function eventAgent() {
  return {
    state: "normal",
    summary:
      "No external event provider is connected. EVENT agent is not fabricating event signals.",
  };
}

function riskAgent(data) {
  const elevated =
    Math.abs(data.trend) > 2.5 ||
    Math.abs(data.bookImbalance) > 0.35 ||
    Math.abs(data.flowImbalance) > 0.4;

  if (elevated) {
    return {
      state: "risk",
      summary:
        "Risk gate detected elevated market imbalance. Execution remains constrained.",
    };
  }

  return {
    state: "normal",
    summary:
      "Risk gate is clear under the current market, liquidity and order-flow measurements.",
  };
}

function executionAgent() {
  return {
    state: "locked",
    summary:
      "Execution remains locked because the system is operating in PAPER MODE.",
  };
}

async function requestDeepSeek(agents, data) {
  const apiKey = process.env.DEEPSEEK_API_KEY;

  if (!apiKey) {
    return {
      available: false,
      summary:
        "DeepSeek is not configured. The system is using deterministic agent analysis only.",
      confidence: null,
      action: null,
      reason: null,
    };
  }

  const payload = {
    market: {
      symbol: "HYPE",
      price: data.price,
      trendPercent: data.trend,
    },
    liquidity: {
      bidDepth: data.bidDepth,
      askDepth: data.askDepth,
      imbalance: data.bookImbalance,
    },
    orderFlow: {
      buyVolume: data.buyVolume,
      sellVolume: data.sellVolume,
      imbalance: data.flowImbalance,
      tradeCount: data.tradeCount,
    },
    agents,
  };

  const response = await fetch(DEEPSEEK_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: "deepseek-chat",
      temperature: 0.1,
      messages: [
        {
          role: "system",
          content: `
You are the AI Brain of a personal crypto market intelligence system.

You do NOT execute trades.
You do NOT invent market data.

Reason only from the supplied real market measurements and six-agent observations.

Your job is to synthesize conflicting signals and produce a conservative PAPER MODE decision.

Possible actions:
WAIT
OBSERVE
BUY_CANDIDATE
SELL_CANDIDATE

Risk has priority.
Execution is locked.
A directional signal is not a trade instruction.
When signals conflict, prefer WAIT or OBSERVE.
Never invent news or events.
Do not claim certainty.

Return ONLY valid JSON.

{
  "action": "WAIT | OBSERVE | BUY_CANDIDATE | SELL_CANDIDATE",
  "confidence": 0,
  "summary": "short explanation",
  "reason": "why this action was selected"
}
          `.trim(),
        },
        {
          role: "user",
          content: JSON.stringify(payload, null, 2),
        },
      ],
    }),
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`DeepSeek HTTP ${response.status}`);
  }

  const result = await response.json();

  const content =
    result?.choices?.[0]?.message?.content;

  if (!content) {
    throw new Error("DeepSeek returned no content");
  }

  let parsed;

  try {
    parsed = JSON.parse(content);
  } catch {
    const cleaned = content
      .replace(/```json/gi, "")
      .replace(/```/g, "")
      .trim();

    parsed = JSON.parse(cleaned);
  }

  const allowedActions = [
    "WAIT",
    "OBSERVE",
    "BUY_CANDIDATE",
    "SELL_CANDIDATE",
  ];

  const action = allowedActions.includes(parsed?.action)
    ? parsed.action
    : "WAIT";

  const confidence = Number.isFinite(
    Number(parsed?.confidence)
  )
    ? Math.max(
        0,
        Math.min(100, Number(parsed.confidence))
      )
    : null;

  return {
    available: true,
    action,
    confidence,
    summary:
      typeof parsed?.summary === "string"
        ? parsed.summary
        : "DeepSeek completed market synthesis.",
    reason:
      typeof parsed?.reason === "string"
        ? parsed.reason
        : "DeepSeek did not provide a detailed reason.",
  };
}

async function getDeepSeekAnalysis(agents, data) {
  const now = Date.now();

  if (aiCache && now - aiCacheAt < AI_CACHE_MS) {
    return aiCache;
  }

  if (aiUpdating) {
    return aiUpdating;
  }

  aiUpdating = requestDeepSeek(agents, data)
    .then((result) => {
      aiCache = result;
      aiCacheAt = Date.now();
      return result;
    })
    .catch((error) => {
      console.error("DeepSeek analysis error:", error);

      return {
        available: false,
        action: null,
        confidence: null,
        summary:
          "DeepSeek analysis is temporarily unavailable. Deterministic agent analysis remains active.",
        reason:
          "The AI Brain could not complete its latest synthesis.",
      };
    })
    .finally(() => {
      aiUpdating = null;
    });

  return aiUpdating;
}

export async function runAgents() {
  const data = await collectMarket();

  const agents = {
    market: marketAgent(data),
    liquidity: liquidityAgent(data),
    flow: flowAgent(data),
    event: eventAgent(),
    risk: riskAgent(data),
    execution: executionAgent(),
  };

  const ai = await getDeepSeekAnalysis(
    agents,
    data
  );

  let action = "WAIT";

  let reason =
    "Signals are not sufficiently aligned.";

  if (agents.risk.state === "risk") {
    action = "WAIT";
    reason =
      "Risk gate has priority over directional signals.";
  } else if (
    ai.available &&
    (
      ai.action === "BUY_CANDIDATE" ||
      ai.action === "SELL_CANDIDATE"
    )
  ) {
    action = ai.action;
    reason = ai.reason;
  } else if (
    ai.available &&
    ai.action === "OBSERVE"
  ) {
    action = "OBSERVE";
    reason = ai.reason;
  } else if (
    agents.market.state === "positive" &&
    agents.liquidity.state === "positive" &&
    agents.flow.state === "positive"
  ) {
    action = "OBSERVE";
    reason =
      "Market, liquidity and order-flow signals are aligned. Execution remains PAPER MODE.";
  }

  if (agents.execution.state === "locked") {
    if (
      action === "BUY_CANDIDATE" ||
      action === "SELL_CANDIDATE"
    ) {
      reason =
        `${reason} Execution remains locked in PAPER MODE.`;
    }
  }

  return {
    timestamp: Date.now(),

    mode: "PAPER",

    market: {
      symbol: "HYPE",
      price: data.price,
      trend5m: data.trend,
    },

    decision: {
      action,
      reason,
    },

    ai: {
      summary: ai.summary,
      confidence: ai.confidence,
      provider: ai.available
        ? "DeepSeek"
        : "deterministic",
    },

    agents,

    metrics: {
      liquidity: {
        bidDepth: data.bidDepth,
        askDepth: data.askDepth,
        imbalance: data.bookImbalance,
      },

      flow: {
        buyVolume: data.buyVolume,
        sellVolume: data.sellVolume,
        imbalance: data.flowImbalance,
        trades: data.tradeCount,
      },
    },
  };
}