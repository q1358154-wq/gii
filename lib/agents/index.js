const INFO_URL =
  "https://api.hyperliquid.xyz/info";

const DEEPSEEK_URL =
  "https://api.deepseek.com/chat/completions";

const COINGECKO_URL =
  "https://api.coingecko.com/api/v3";

const AI_CACHE_MS = 30_000;

const ASSETS = {
  HYPE: {
    id: "HYPE",
    hyperliquid: "HYPE",
    gecko: "hyperliquid",
  },
  SUI: {
    id: "SUI",
    hyperliquid: "SUI",
    gecko: "sui",
  },
  JITOSOL: {
    id: "JITOSOL",
    hyperliquid: "JITOSOL",
    gecko: "jito-staked-sol",
  },
};

const aiCache = new Map();
const aiUpdating = new Map();

async function request(body) {
  const response = await fetch(
    INFO_URL,
    {
      method: "POST",
      headers: {
        "Content-Type":
          "application/json",
      },
      body: JSON.stringify(body),
      cache: "no-store",
    }
  );

  if (!response.ok) {
    throw new Error(
      `Hyperliquid HTTP ${response.status}`
    );
  }

  return response.json();
}

function n(value) {
  const result = Number(value);

  return Number.isFinite(result)
    ? result
    : 0;
}

function average(values) {
  if (!values.length) return 0;

  return (
    values.reduce(
      (sum, value) =>
        sum + value,
      0
    ) / values.length
  );
}

async function geckoMarket(
  symbol
) {
  const asset = ASSETS[symbol];

  if (!asset?.gecko) {
    throw new Error(
      `No CoinGecko mapping for ${symbol}`
    );
  }

  const response = await fetch(
    `${COINGECKO_URL}/coins/${asset.gecko}/market_chart?vs_currency=usd&days=1&interval=5m`,
    {
      cache: "no-store",
    }
  );

  if (!response.ok) {
    throw new Error(
      `CoinGecko HTTP ${response.status}`
    );
  }

  const data =
    await response.json();

  const prices = Array.isArray(
    data?.prices
  )
    ? data.prices
        .map((item) =>
          n(item?.[1])
        )
        .filter(
          (value) => value > 0
        )
    : [];

  const price =
    prices.at(-1) || 0;

  const recent =
    prices.slice(-12);

  const previous =
    prices.slice(-24, -12);

  const recentAverage =
    average(recent);

  const previousAverage =
    average(previous);

  const trend =
    previousAverage > 0
      ? ((recentAverage -
          previousAverage) /
          previousAverage) *
        100
      : 0;

  return {
    price,
    trend,
  };
}

async function collectMarket(
  symbol
) {
  const asset = ASSETS[symbol];

  if (!asset) {
    throw new Error(
      `Unsupported asset ${symbol}`
    );
  }

  let price = 0;
  let trend = 0;
  let book = null;
  let trades = [];
  let candles = [];

  /*
   * HYPE / SUI:
   * use Hyperliquid market microstructure
   * when available.
   *
   * JitoSOL:
   * use CoinGecko for real price/trend.
   * We do NOT fabricate an order book or
   * trades when no native Hyperliquid market
   * exists.
   */

  if (asset.hyperliquid) {
    try {
      const mids =
        await request({
          type: "allMids",
        });

      price = n(
        mids?.[asset.hyperliquid]
      );
    } catch {}
  }

  if (asset.hyperliquid) {
    try {
      candles =
        await request({
          type: "candleSnapshot",
          req: {
            coin:
              asset.hyperliquid,
            interval: "5m",
            startTime:
              Date.now() -
              6 *
                60 *
                60 *
                1000,
            endTime:
              Date.now(),
          },
        });
    } catch {}
  }

  if (Array.isArray(candles)) {
    const closes =
      candles
        .map((item) =>
          n(item?.c)
        )
        .filter(
          (value) => value > 0
        );

    const recent =
      closes.slice(-12);

    const previous =
      closes.slice(-24, -12);

    const recentAverage =
      average(recent);

    const previousAverage =
      average(previous);

    if (previousAverage > 0) {
      trend =
        ((recentAverage -
          previousAverage) /
          previousAverage) *
        100;
    }
  }

  if (
    asset.hyperliquid
  ) {
    try {
      book =
        await request({
          type: "l2Book",
          coin:
            asset.hyperliquid,
        });
    } catch {}
  }

  if (
    asset.hyperliquid
  ) {
    try {
      const result =
        await request({
          type: "recentTrades",
          coin:
            asset.hyperliquid,
        });

      if (
        Array.isArray(result)
      ) {
        trades = result;
      }
    } catch {}
  }

  /*
   * Real fallback for assets that do not
   * provide the required Hyperliquid feed.
   */
  if (
    !price ||
    !candles?.length
  ) {
    const fallback =
      await geckoMarket(
        symbol
      );

    if (!price) {
      price =
        fallback.price;
    }

    if (!candles?.length) {
      trend =
        fallback.trend;
    }
  }

  const levels =
    book?.levels || [];

  const bids =
    Array.isArray(levels[0])
      ? levels[0]
      : [];

  const asks =
    Array.isArray(levels[1])
      ? levels[1]
      : [];

  const bidDepth =
    bids.reduce(
      (sum, item) =>
        sum +
        n(item?.px) *
          n(item?.sz),
      0
    );

  const askDepth =
    asks.reduce(
      (sum, item) =>
        sum +
        n(item?.px) *
          n(item?.sz),
      0
    );

  const totalDepth =
    bidDepth + askDepth;

  const bookImbalance =
    totalDepth > 0
      ? (bidDepth -
          askDepth) /
        totalDepth
      : 0;

  let buyVolume = 0;
  let sellVolume = 0;

  for (const trade of trades) {
    const size =
      n(trade?.sz);

    if (
      trade?.side === "B"
    ) {
      buyVolume += size;
    }

    if (
      trade?.side === "A"
    ) {
      sellVolume += size;
    }
  }

  const totalFlow =
    buyVolume +
    sellVolume;

  const flowImbalance =
    totalFlow > 0
      ? (buyVolume -
          sellVolume) /
        totalFlow
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
    tradeCount:
      trades.length,
  };
}

function marketAgent(data) {
  if (data.trend > 0.35) {
    return {
      state: "positive",
      summary:
        `Short-term structure is supportive. The recent 1-hour average is ${data.trend.toFixed(
          2
        )}% above the previous window.`,
      summaryZh:
        `短期结构偏强。最近 1 小时均值比前一窗口高 ${data.trend.toFixed(
          2
        )}%。`,
    };
  }

  if (data.trend < -0.75) {
    return {
      state: "warning",
      summary:
        `Short-term structure is weakening. The recent 1-hour average is ${Math.abs(
          data.trend
        ).toFixed(
          2
        )}% below the previous window.`,
      summaryZh:
        `短期结构走弱。最近 1 小时均值比前一窗口低 ${Math.abs(
          data.trend
        ).toFixed(
          2
        )}%。`,
    };
  }

  return {
    state: "normal",
    summary:
      `Market structure is mixed. Average-window change is ${data.trend.toFixed(
        2
      )}%.`,
    summaryZh:
      `市场结构中性。窗口均值变化为 ${data.trend.toFixed(
        2
      )}%。`,
  };
}

function liquidityAgent(data) {
  if (
    data.bookImbalance > 0.12
  ) {
    return {
      state: "positive",
      summary:
        `Bid-side liquidity is stronger. Book imbalance is +${(
          data.bookImbalance *
          100
        ).toFixed(1)}%.`,
      summaryZh:
        `买方流动性更强。盘口失衡为 +${(
          data.bookImbalance *
          100
        ).toFixed(1)}%。`,
    };
  }

  if (
    data.bookImbalance <
    -0.12
  ) {
    return {
      state: "warning",
      summary:
        `Ask-side liquidity is stronger. Book imbalance is ${(
          data.bookImbalance *
          100
        ).toFixed(1)}%.`,
      summaryZh:
        `卖方流动性更强。盘口失衡为 ${(
          data.bookImbalance *
          100
        ).toFixed(1)}%。`,
    };
  }

  return {
    state: "normal",
    summary:
      `Order-book liquidity is relatively balanced. Imbalance is ${(
        data.bookImbalance *
        100
      ).toFixed(1)}%.`,
    summaryZh:
      `订单簿流动性相对均衡。失衡为 ${(
        data.bookImbalance *
        100
      ).toFixed(1)}%。`,
  };
}

function flowAgent(data) {
  if (
    data.flowImbalance > 0.15
  ) {
    return {
      state: "positive",
      summary:
        `Recent taker flow is buy-dominant. Flow imbalance is +${(
          data.flowImbalance *
          100
        ).toFixed(1)}%.`,
      summaryZh:
        `近期主动成交以买方为主。订单流失衡为 +${(
          data.flowImbalance *
          100
        ).toFixed(1)}%。`,
    };
  }

  if (
    data.flowImbalance <
    -0.15
  ) {
    return {
      state: "warning",
      summary:
        `Recent taker flow is sell-dominant. Flow imbalance is ${(
          data.flowImbalance *
          100
        ).toFixed(1)}%.`,
      summaryZh:
        `近期主动成交以卖方为主。订单流失衡为 ${(
          data.flowImbalance *
          100
        ).toFixed(1)}%。`,
    };
  }

  return {
    state: "normal",
    summary:
      `Recent taker flow is mixed. Flow imbalance is ${(
        data.flowImbalance *
        100
      ).toFixed(1)}%.`,
    summaryZh:
      `近期主动成交混合。订单流失衡为 ${(
        data.flowImbalance *
        100
      ).toFixed(1)}%。`,
  };
}

function eventAgent() {
  return {
    state: "normal",
    summary:
      "No external event provider is connected. EVENT agent is not fabricating event signals.",
    summaryZh:
      "未连接外部事件源。EVENT 代理不会虚构事件信号。",
  };
}

function riskAgent(data) {
  const elevated =
    Math.abs(data.trend) >
      2.5 ||
    Math.abs(
      data.bookImbalance
    ) > 0.35 ||
    Math.abs(
      data.flowImbalance
    ) > 0.4;

  if (elevated) {
    return {
      state: "risk",
      summary:
        "Risk gate detected elevated market imbalance. Execution remains constrained.",
      summaryZh:
        "风险门检测到较高市场失衡，执行受到限制。",
    };
  }

  return {
    state: "normal",
    summary:
      "Risk gate is clear under the current market, liquidity and order-flow measurements.",
    summaryZh:
      "当前市场、流动性和订单流指标均通过风险门。",
  };
}

function executionAgent() {
  return {
    state: "locked",
    summary:
      "Execution remains locked because the system is operating in PAPER MODE.",
    summaryZh:
      "执行保持锁定，因为系统运行在纸面模式。",
  };
}

async function requestDeepSeek(
  symbol,
  agents,
  data
) {
  const apiKey =
    process.env
      .DEEPSEEK_API_KEY;

  if (!apiKey) {
    return {
      available: false,
      summary:
        "DeepSeek is not configured. The system is using deterministic agent analysis only.",
      summaryZh:
        "DeepSeek 未配置，系统仅使用确定性代理分析。",
      confidence: null,
      action: null,
      reason: null,
      reasonZh: null,
    };
  }

  const payload = {
    market: {
      symbol,
      price: data.price,
      trendPercent:
        data.trend,
    },

    liquidity: {
      bidDepth:
        data.bidDepth,
      askDepth:
        data.askDepth,
      imbalance:
        data.bookImbalance,
    },

    orderFlow: {
      buyVolume:
        data.buyVolume,
      sellVolume:
        data.sellVolume,
      imbalance:
        data.flowImbalance,
      tradeCount:
        data.tradeCount,
    },

    agents,
  };

  const response =
    await fetch(
      DEEPSEEK_URL,
      {
        method: "POST",
        headers: {
          "Content-Type":
            "application/json",
          Authorization:
            `Bearer ${apiKey}`,
        },

        body: JSON.stringify({
          model:
            "deepseek-chat",

          temperature: 0.1,

          messages: [
            {
              role: "system",
              content: `
You are the AI Brain of a personal crypto market intelligence system.

You do NOT execute trades.
You do NOT invent market data.

Reason only from the supplied real market measurements and six-agent observations.

Produce a conservative PAPER MODE decision.

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
  "summary": "English explanation",
  "summaryZh": "Chinese explanation",
  "reason": "English reason",
  "reasonZh": "Chinese reason"
}
              `.trim(),
            },

            {
              role: "user",
              content:
                JSON.stringify(
                  payload,
                  null,
                  2
                ),
            },
          ],
        }),

        cache: "no-store",
      }
    );

  if (!response.ok) {
    throw new Error(
      `DeepSeek HTTP ${response.status}`
    );
  }

  const result =
    await response.json();

  const content =
    result?.choices?.[0]
      ?.message?.content;

  if (!content) {
    throw new Error(
      "DeepSeek returned no content"
    );
  }

  let parsed;

  try {
    parsed =
      JSON.parse(content);
  } catch {
    parsed = JSON.parse(
      content
        .replace(
          /```json/gi,
          ""
        )
        .replace(
          /```/g,
          ""
        )
        .trim()
    );
  }

  const allowedActions = [
    "WAIT",
    "OBSERVE",
    "BUY_CANDIDATE",
    "SELL_CANDIDATE",
  ];

  return {
    available: true,

    action:
      allowedActions.includes(
        parsed?.action
      )
        ? parsed.action
        : "WAIT",

    confidence:
      Number.isFinite(
        Number(
          parsed?.confidence
        )
      )
        ? Math.max(
            0,
            Math.min(
              100,
              Number(
                parsed.confidence
              )
            )
          )
        : null,

    summary:
      typeof parsed?.summary ===
      "string"
        ? parsed.summary
        : "DeepSeek completed market synthesis.",

    summaryZh:
      typeof parsed?.summaryZh ===
      "string"
        ? parsed.summaryZh
        : "DeepSeek 已完成市场综合分析。",

    reason:
      typeof parsed?.reason ===
      "string"
        ? parsed.reason
        : "DeepSeek did not provide a detailed reason.",

    reasonZh:
      typeof parsed?.reasonZh ===
      "string"
        ? parsed.reasonZh
        : "DeepSeek 未提供详细原因。",
  };
}

async function getDeepSeekAnalysis(
  symbol,
  agents,
  data
) {
  const now = Date.now();

  const cached =
    aiCache.get(symbol);

  if (
    cached &&
    now - cached.at <
      AI_CACHE_MS
  ) {
    return cached.value;
  }

  if (
    aiUpdating.has(symbol)
  ) {
    return aiUpdating.get(
      symbol
    );
  }

  const promise =
    requestDeepSeek(
      symbol,
      agents,
      data
    )
      .then((result) => {
        aiCache.set(symbol, {
          value: result,
          at: Date.now(),
        });

        return result;
      })
      .catch((error) => {
        console.error(
          "DeepSeek analysis error:",
          error
        );

        return {
          available: false,
          action: null,
          confidence: null,
          summary:
            "DeepSeek analysis is temporarily unavailable. Deterministic agent analysis remains active.",
          summaryZh:
            "DeepSeek 分析暂时不可用，确定性代理分析仍在运行。",
          reason:
            "The AI Brain could not complete its latest synthesis.",
          reasonZh:
            "AI 大脑未能完成本次综合分析。",
        };
      })
      .finally(() => {
        aiUpdating.delete(
          symbol
        );
      });

  aiUpdating.set(
    symbol,
    promise
  );

  return promise;
}

async function analyzeMarket(
  symbol,
  data
) {
  const agents = {
    market:
      marketAgent(data),
    liquidity:
      liquidityAgent(data),
    flow:
      flowAgent(data),
    event:
      eventAgent(),
    risk:
      riskAgent(data),
    execution:
      executionAgent(),
  };

  const ai =
    await getDeepSeekAnalysis(
      symbol,
      agents,
      data
    );

  let action = "WAIT";

  let reason =
    "Signals are not sufficiently aligned.";

  let reasonZh =
    "信号尚未形成足够一致性。";

  if (
    agents.risk.state ===
    "risk"
  ) {
    action = "WAIT";

    reason =
      "Risk gate has priority over directional signals.";

    reasonZh =
      "风险门优先于方向性信号。";
  } else if (
    ai.available &&
    [
      "BUY_CANDIDATE",
      "SELL_CANDIDATE",
    ].includes(ai.action)
  ) {
    action = ai.action;
    reason = ai.reason;
    reasonZh = ai.reasonZh;
  } else if (
    ai.available &&
    ai.action ===
      "OBSERVE"
  ) {
    action = "OBSERVE";
    reason = ai.reason;
    reasonZh = ai.reasonZh;
  } else if (
    agents.market.state ===
      "positive" &&
    agents.liquidity.state ===
      "positive" &&
    agents.flow.state ===
      "positive"
  ) {
    action = "OBSERVE";

    reason =
      "Market, liquidity and order-flow signals are aligned. Execution remains PAPER MODE.";

    reasonZh =
      "市场、流动性和订单流信号一致。执行仍处于纸面模式。";
  }

  if (
    agents.execution.state ===
      "locked" &&
    [
      "BUY_CANDIDATE",
      "SELL_CANDIDATE",
    ].includes(action)
  ) {
    reason =
      `${reason} Execution remains locked in PAPER MODE.`;

    reasonZh =
      `${reasonZh} 执行仍锁定在纸面模式。`;
  }

  return {
    timestamp: Date.now(),

    mode: "PAPER",

    market: {
      symbol,
      price: data.price,
      trend5m: data.trend,
    },

    decision: {
      action,
      reason,
      reasonZh,
    },

    ai: {
      summary:
        ai.summary,
      summaryZh:
        ai.summaryZh,
      confidence:
        ai.confidence,
      provider:
        ai.available
          ? "DeepSeek"
          : "deterministic",
    },

    agents,

    metrics: {
      liquidity: {
        bidDepth:
          data.bidDepth,
        askDepth:
          data.askDepth,
        imbalance:
          data.bookImbalance,
      },

      flow: {
        buyVolume:
          data.buyVolume,
        sellVolume:
          data.sellVolume,
        imbalance:
          data.flowImbalance,
        trades:
          data.tradeCount,
      },
    },
  };
}

export async function runAgents() {
  const markets = {};

  for (const symbol of Object.keys(
    ASSETS
  )) {
    try {
      const data =
        await collectMarket(
          symbol
        );

      markets[symbol] =
        await analyzeMarket(
          symbol,
          data
        );
    } catch (error) {
      console.error(
        `${symbol} market error:`,
        error
      );

      markets[symbol] = {
        timestamp: Date.now(),

        mode: "PAPER",

        market: {
          symbol,
          price: null,
          trend5m: null,
        },

        decision: {
          action: "WAIT",
          reason:
            "Market data is temporarily unavailable.",
          reasonZh:
            "市场数据暂时不可用。",
        },

        ai: {
          summary:
            "No analysis available.",
          summaryZh:
            "暂无分析。",
          confidence: null,
          provider:
            "deterministic",
        },

        agents: {
          market: {
            state: "normal",
            summary:
              "Market data unavailable.",
            summaryZh:
              "市场数据不可用。",
          },

          liquidity: {
            state: "normal",
            summary:
              "Market data unavailable.",
            summaryZh:
              "市场数据不可用。",
          },

          flow: {
            state: "normal",
            summary:
              "Market data unavailable.",
            summaryZh:
              "市场数据不可用。",
          },

          event:
            eventAgent(),

          risk: {
            state: "risk",
            summary:
              "Risk gate is constrained because market data is unavailable.",
            summaryZh:
              "由于市场数据不可用，风险门保持限制。",
          },

          execution:
            executionAgent(),
        },

        metrics: {
          liquidity: {
            bidDepth: 0,
            askDepth: 0,
            imbalance: 0,
          },

          flow: {
            buyVolume: 0,
            sellVolume: 0,
            imbalance: 0,
            trades: 0,
          },
        },
      };
    }
  }

  return {
    ...(markets.HYPE || {}),

    timestamp: Date.now(),

    markets,
  };
}