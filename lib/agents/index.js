const INFO_URL = "https://api.hyperliquid.xyz/info";
const DEEPSEEK_URL = "https://api.deepseek.com/chat/completions";
const COINGECKO_URL = "https://api.coingecko.com/api/v3";

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
    hyperliquid: null,
    gecko: "jito-staked-sol",
  },
};

let aiCache = {
  timestamp: 0,
  key: "",
  value: null,
};

function finite(value) {
  const number = Number(value);

  return Number.isFinite(number)
    ? number
    : null;
}

function n(value) {
  return finite(value);
}

function average(values) {
  const valid = values
    .map(finite)
    .filter((value) => value !== null);

  if (!valid.length) {
    return null;
  }

  return (
    valid.reduce(
      (sum, value) => sum + value,
      0
    ) / valid.length
  );
}

function trendFromPrices(prices) {
  if (!Array.isArray(prices)) {
    return null;
  }

  const valid = prices
    .map((item) => {
      if (Array.isArray(item)) {
        return finite(item[1]);
      }

      return finite(item);
    })
    .filter((value) => value !== null);

  if (valid.length < 2) {
    return null;
  }

  const first = valid[0];
  const last = valid[valid.length - 1];

  if (!Number.isFinite(first) || first === 0) {
    return null;
  }

  return ((last - first) / first) * 100;
}

async function fetchJson(
  url,
  options = {},
  timeoutMs = 10_000
) {
  const controller =
    new AbortController();

  const timer = setTimeout(
    () => controller.abort(),
    timeoutMs
  );

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
      cache: "no-store",
    });

    if (!response.ok) {
      throw new Error(
        `HTTP ${response.status}`
      );
    }

    return await response.json();
  } finally {
    clearTimeout(timer);
  }
}

async function hyperliquidInfo(
  payload
) {
  return fetchJson(
    INFO_URL,
    {
      method: "POST",
      headers: {
        "Content-Type":
          "application/json",
      },
      body: JSON.stringify(payload),
    },
    10_000
  );
}

async function geckoMarket(symbol) {
  const asset =
    ASSETS[symbol];

  if (!asset?.gecko) {
    return {
      price: null,
      trend: null,
      source: null,
    };
  }

  try {
    const url =
      `${COINGECKO_URL}/coins/` +
      `${encodeURIComponent(
        asset.gecko
      )}/market_chart` +
      `?vs_currency=usd&days=1&interval=5m`;

    const data =
      await fetchJson(url, {}, 12_000);

    const prices =
      Array.isArray(data?.prices)
        ? data.prices
        : [];

    const latest =
      prices.length
        ? finite(
            prices[
              prices.length - 1
            ]?.[1]
          )
        : null;

    return {
      price: latest,
      trend:
        trendFromPrices(prices),
      source: "coingecko",
    };
  } catch (error) {
    console.error(
      `CoinGecko ${symbol} error:`,
      error?.message || error
    );

    return {
      price: null,
      trend: null,
      source: null,
    };
  }
}

async function getHyperliquidMid(
  symbol
) {
  if (!ASSETS[symbol]?.hyperliquid) {
    return null;
  }

  try {
    const data =
      await hyperliquidInfo({
        type: "allMids",
      });

    return finite(
      data?.[
        ASSETS[symbol].hyperliquid
      ]
    );
  } catch (error) {
    console.error(
      `Hyperliquid mid ${symbol} error:`,
      error?.message || error
    );

    return null;
  }
}

async function getHyperliquidCandles(
  symbol
) {
  if (!ASSETS[symbol]?.hyperliquid) {
    return [];
  }

  try {
    const endTime =
      Date.now();

    const startTime =
      endTime -
      24 * 60 * 60 * 1000;

    const data =
      await hyperliquidInfo({
        type: "candleSnapshot",
        req: {
          coin:
            ASSETS[symbol]
              .hyperliquid,
          interval: "5m",
          startTime,
          endTime,
        },
      });

    return Array.isArray(data)
      ? data
      : [];
  } catch (error) {
    console.error(
      `Hyperliquid candles ${symbol} error:`,
      error?.message || error
    );

    return [];
  }
}

function candleClose(
  candle
) {
  if (!candle) {
    return null;
  }

  if (
    typeof candle === "object" &&
    !Array.isArray(candle)
  ) {
    return finite(
      candle.c ??
        candle.close ??
        candle.C
    );
  }

  if (Array.isArray(candle)) {
    return finite(
      candle[4]
    );
  }

  return null;
}

function trendFromCandles(
  candles
) {
  if (!candles.length) {
    return null;
  }

  const closes =
    candles
      .map(candleClose)
      .filter(
        (value) =>
          value !== null
      );

  return trendFromPrices(
    closes
  );
}

async function getHyperliquidBook(
  symbol
) {
  if (!ASSETS[symbol]?.hyperliquid) {
    return null;
  }

  try {
    const data =
      await hyperliquidInfo({
        type: "l2Book",
        coin:
          ASSETS[symbol]
            .hyperliquid,
      });

    if (
      !Array.isArray(
        data?.levels
      )
    ) {
      return null;
    }

    const bids =
      Array.isArray(
        data.levels[0]
      )
        ? data.levels[0]
        : [];

    const asks =
      Array.isArray(
        data.levels[1]
      )
        ? data.levels[1]
        : [];

    const bidDepth =
      bids.reduce(
        (sum, level) => {
          const px = finite(
            level?.px
          );

          const sz = finite(
            level?.sz
          );

          if (
            px === null ||
            sz === null
          ) {
            return sum;
          }

          return (
            sum + px * sz
          );
        },
        0
      );

    const askDepth =
      asks.reduce(
        (sum, level) => {
          const px = finite(
            level?.px
          );

          const sz = finite(
            level?.sz
          );

          if (
            px === null ||
            sz === null
          ) {
            return sum;
          }

          return (
            sum + px * sz
          );
        },
        0
      );

    if (
      !Number.isFinite(
        bidDepth
      ) ||
      !Number.isFinite(
        askDepth
      ) ||
      bidDepth + askDepth === 0
    ) {
      return null;
    }

    return {
      bidDepth,
      askDepth,
      imbalance:
        (bidDepth - askDepth) /
        (bidDepth + askDepth),
    };
  } catch (error) {
    console.error(
      `Hyperliquid book ${symbol} error:`,
      error?.message || error
    );

    return null;
  }
}

async function getHyperliquidTrades(
  symbol
) {
  if (!ASSETS[symbol]?.hyperliquid) {
    return null;
  }

  try {
    const data =
      await hyperliquidInfo({
        type: "recentTrades",
        coin:
          ASSETS[symbol]
            .hyperliquid,
      });

    if (!Array.isArray(data)) {
      return null;
    }

    let buyVolume = 0;
    let sellVolume = 0;
    let validTrades = 0;

    for (const trade of data) {
      const price = finite(
        trade?.px
      );

      const size = finite(
        trade?.sz
      );

      if (
        price === null ||
        size === null ||
        size < 0
      ) {
        continue;
      }

      const notional =
        price * size;

      if (
        !Number.isFinite(
          notional
        )
      ) {
        continue;
      }

      /*
       * Hyperliquid recentTrades uses
       * side information. Depending on
       * response version it can appear
       * as "side" / "dir".
       */
      const side = String(
        trade?.side ??
          trade?.dir ??
          ""
      ).toUpperCase();

      if (
        side === "B" ||
        side === "BUY"
      ) {
        buyVolume +=
          notional;
      } else if (
        side === "A" ||
        side === "SELL"
      ) {
        sellVolume +=
          notional;
      } else {
        continue;
      }

      validTrades += 1;
    }

    if (
      validTrades === 0 ||
      buyVolume +
        sellVolume ===
        0
    ) {
      return null;
    }

    return {
      buyVolume,
      sellVolume,
      imbalance:
        (buyVolume -
          sellVolume) /
        (buyVolume +
          sellVolume),
      trades: validTrades,
    };
  } catch (error) {
    console.error(
      `Hyperliquid trades ${symbol} error:`,
      error?.message || error
    );

    return null;
  }
}

async function collectMarket(
  symbol
) {
  const asset =
    ASSETS[symbol];

  if (!asset) {
    throw new Error(
      `Unsupported asset: ${symbol}`
    );
  }

  let price = null;
  let trend5m = null;
  let priceSource = null;

  let book = null;
  let trades = null;

  /*
   * HYPE / SUI:
   * Hyperliquid is the first source.
   *
   * JitoSOL:
   * deliberately does NOT use Hyperliquid.
   */
  if (asset.hyperliquid) {
    price =
      await getHyperliquidMid(
        symbol
      );

    const candles =
      await getHyperliquidCandles(
        symbol
      );

    trend5m =
      trendFromCandles(
        candles
      );

    book =
      await getHyperliquidBook(
        symbol
      );

    trades =
      await getHyperliquidTrades(
        symbol
      );

    if (price !== null) {
      priceSource =
        "hyperliquid";
    }
  }

  /*
   * CoinGecko fallback / primary source
   * for assets without a Hyperliquid market.
   */
  if (
    price === null ||
    trend5m === null
  ) {
    const gecko =
      await geckoMarket(
        symbol
      );

    if (
      price === null &&
      gecko.price !== null
    ) {
      price =
        gecko.price;
      priceSource =
        gecko.source;
    }

    if (
      trend5m === null &&
      gecko.trend !== null
    ) {
      trend5m =
        gecko.trend;
    }
  }

  /*
   * IMPORTANT:
   *
   * No real order book =
   * null.
   *
   * No real trades =
   * null.
   *
   * Never convert unavailable
   * information into zero.
   */
  const liquidity = {
    bidDepth:
      book?.bidDepth ??
      null,

    askDepth:
      book?.askDepth ??
      null,

    imbalance:
      book?.imbalance ??
      null,

    available:
      Boolean(book),
  };

  const flow = {
    buyVolume:
      trades?.buyVolume ??
      null,

    sellVolume:
      trades?.sellVolume ??
      null,

    imbalance:
      trades?.imbalance ??
      null,

    trades:
      trades?.trades ??
      null,

    available:
      Boolean(trades),
  };

  return {
    symbol,

    market: {
      price,
      trend5m,
      source: priceSource,
      available:
        price !== null,
    },

    metrics: {
      liquidity,
      flow,
    },

    sources: {
      price:
        priceSource,
      liquidity:
        book
          ? "hyperliquid"
          : null,
      flow:
        trades
          ? "hyperliquid"
          : null,
    },

    timestamp:
      Date.now(),
  };
}

function marketAgent(
  market
) {
  const trend =
    finite(
      market?.market?.trend5m
    );

  if (trend === null) {
    return {
      state: "locked",
      role: "Market Structure",
      summary:
        "Market structure unavailable because no valid real-time trend measurement is available.",
      summaryZh:
        "市场结构不可用，因为当前没有有效的实时趋势数据。",
    };
  }

  if (trend >= 1.5) {
    return {
      state: "positive",
      role: "Market Structure",
      summary:
        "Short-term market structure is supportive.",
      summaryZh:
        "短周期市场结构偏支持。",
    };
  }

  if (trend <= -1.5) {
    return {
      state: "risk",
      role: "Market Structure",
      summary:
        "Short-term market structure is adverse.",
      summaryZh:
        "短周期市场结构偏不利。",
    };
  }

  if (
    Math.abs(trend) >=
    0.5
  ) {
    return {
      state: "warning",
      role: "Market Structure",
      summary:
        "Market structure is directional but not decisive.",
      summaryZh:
        "市场结构存在方向，但还不够明确。",
    };
  }

  return {
    state: "normal",
    role: "Market Structure",
    summary:
      "Market structure is relatively neutral.",
    summaryZh:
      "市场结构目前相对中性。",
  };
}

function liquidityAgent(
  market
) {
  const imbalance =
    finite(
      market?.metrics
        ?.liquidity
        ?.imbalance
    );

  if (imbalance === null) {
    return {
      state: "locked",
      role: "Liquidity Depth",
      summary:
        "Liquidity state unavailable because no valid real order-book measurement is available.",
      summaryZh:
        "流动性状态不可用，因为当前没有有效的真实盘口数据。",
    };
  }

  if (imbalance >= 0.2) {
    return {
      state: "positive",
      role: "Liquidity Depth",
      summary:
        "Bid-side depth is dominant.",
      summaryZh:
        "买方盘口深度占优。",
    };
  }

  if (imbalance <= -0.2) {
    return {
      state: "risk",
      role: "Liquidity Depth",
      summary:
        "Ask-side depth is dominant.",
      summaryZh:
        "卖方盘口深度占优。",
    };
  }

  return {
    state: "normal",
    role: "Liquidity Depth",
    summary:
      "Order-book depth is relatively balanced.",
    summaryZh:
      "盘口深度相对均衡。",
  };
}

function flowAgent(
  market
) {
  const imbalance =
    finite(
      market?.metrics
        ?.flow
        ?.imbalance
    );

  if (imbalance === null) {
    return {
      state: "locked",
      role: "Order Flow",
      summary:
        "Order flow unavailable because no valid real trade-flow measurement is available.",
      summaryZh:
        "订单流不可用，因为当前没有有效的真实成交流数据。",
    };
  }

  if (imbalance >= 0.2) {
    return {
      state: "positive",
      role: "Order Flow",
      summary:
        "Recent executed flow is buy-side dominant.",
      summaryZh:
        "近期真实成交流偏向买方。",
    };
  }

  if (imbalance <= -0.2) {
    return {
      state: "risk",
      role: "Order Flow",
      summary:
        "Recent executed flow is sell-side dominant.",
      summaryZh:
        "近期真实成交流偏向卖方。",
    };
  }

  return {
    state: "normal",
    role: "Order Flow",
    summary:
      "Recent executed flow is relatively balanced.",
    summaryZh:
      "近期真实成交流相对均衡。",
  };
}

function eventAgent() {
  /*
   * There is currently no dedicated
   * external-event provider connected
   * to this deterministic layer.
   *
   * Therefore:
   * no fake news,
   * no fake event score,
   * no fabricated event signal.
   */
  return {
    state: "normal",
    role: "External Events",
    available: false,
    summary:
      "No external-event provider is connected.",
    summaryZh:
      "当前没有连接外部事件数据源。",
  };
}

function riskAgent(
  market
) {
  const price =
    finite(
      market?.market?.price
    );

  const trend =
    finite(
      market?.market?.trend5m
    );

  const bookImbalance =
    finite(
      market?.metrics
        ?.liquidity
        ?.imbalance
    );

  const flowImbalance =
    finite(
      market?.metrics
        ?.flow
        ?.imbalance
    );

  /*
   * Risk always has priority.
   *
   * If important real measurements
   * are unavailable, do not pretend
   * that risk is normal.
   */
  if (
    price === null ||
    trend === null ||
    bookImbalance === null ||
    flowImbalance === null
  ) {
    return {
      state: "risk",
      role: "Risk Gate",
      blocked: true,
      summary:
        "Risk gate is constrained because one or more required real measurements are unavailable.",
      summaryZh:
        "风险门受到限制，因为一个或多个必要的真实数据指标不可用。",
    };
  }

  const extremeTrend =
    Math.abs(trend) >=
    4;

  const extremeBook =
    Math.abs(
      bookImbalance
    ) >= 0.65;

  const extremeFlow =
    Math.abs(
      flowImbalance
    ) >= 0.65;

  if (
    extremeTrend ||
    extremeBook ||
    extremeFlow
  ) {
    return {
      state: "risk",
      role: "Risk Gate",
      blocked: true,
      summary:
        "Risk gate detected elevated short-term market conditions.",
      summaryZh:
        "风险门检测到短周期市场条件明显升高。",
    };
  }

  if (
    Math.abs(trend) >=
      2.5 ||
    Math.abs(
      bookImbalance
    ) >= 0.45 ||
    Math.abs(
      flowImbalance
    ) >= 0.45
  ) {
    return {
      state: "warning",
      role: "Risk Gate",
      blocked: false,
      summary:
        "Risk conditions require caution.",
      summaryZh:
        "当前风险条件需要保持谨慎。",
    };
  }

  return {
    state: "positive",
    role: "Risk Gate",
    blocked: false,
    summary:
      "Risk measurements are within the deterministic operating range.",
    summaryZh:
      "风险指标处于确定性运行范围内。",
  };
}

function executionAgent() {
  /*
   * V4:
   *
   * AI must never execute trades.
   * PAPER mode remains locked.
   */
  return {
    state: "locked",
    role: "Execution Engine",
    available: false,
    blocked: true,
    mode: "PAPER",
    summary:
      "Execution is locked in PAPER mode. AI cannot execute trades.",
    summaryZh:
      "当前为纸面模式，执行已锁定。AI 不得执行真实交易。",
  };
}

function deterministicDecision(
  market,
  agents
) {
  const risk =
    agents?.risk;

  const execution =
    agents?.execution;

  if (
    risk?.blocked ||
    risk?.state ===
      "risk"
  ) {
    return {
      action: "WAIT",
      reason:
        "Risk gate has priority and is restricting directional action.",
      reasonZh:
        "风险门优先，目前限制方向性操作。",
    };
  }

  if (
    execution?.blocked
  ) {
    return {
      action: "WAIT",
      reason:
        "Execution remains locked in PAPER mode.",
      reasonZh:
        "当前为纸面模式，执行保持锁定。",
    };
  }

  const trend =
    finite(
      market?.market?.trend5m
    );

  if (trend === null) {
    return {
      action: "WAIT",
      reason:
        "Waiting for valid market structure data.",
      reasonZh:
        "等待有效的市场结构数据。",
    };
  }

  if (trend > 1.5) {
    return {
      action: "SUPPORTIVE",
      reason:
        "Deterministic market structure is supportive.",
      reasonZh:
        "确定性市场结构偏支持。",
    };
  }

  if (trend < -1.5) {
    return {
      action: "WAIT",
      reason:
        "Deterministic market structure is adverse.",
      reasonZh:
        "确定性市场结构偏不利，等待。",
    };
  }

  return {
    action: "WAIT",
    reason:
      "No sufficiently strong deterministic directional condition.",
    reasonZh:
      "当前没有足够强的确定性方向条件。",
  };
}

async function requestDeepSeek(
  market,
  agents,
  decision
) {
  const apiKey =
    process.env.DEEPSEEK_API_KEY;

  if (!apiKey) {
    return {
      provider: "deterministic",
      confidence: null,
      summary:
        "DeepSeek is not configured. Deterministic logic remains authoritative.",
      summaryZh:
        "DeepSeek 未配置，当前以确定性逻辑为准。",
    };
  }

  const payload = {
    asset:
      market?.symbol,

    market:
      market?.market,

    liquidity:
      market?.metrics
        ?.liquidity,

    flow:
      market?.metrics
        ?.flow,

    agents,

    deterministicDecision:
      decision,

    rules: [
      "Use only supplied real measurements.",
      "Never invent missing values.",
      "Never convert null into zero.",
      "Risk gate has priority.",
      "AI cannot execute trades.",
      "Execution remains locked in PAPER mode.",
      "If required data is unavailable, prefer WAIT.",
    ],
  };

  const cacheKey =
    JSON.stringify(payload);

  if (
    aiCache.value &&
    aiCache.key ===
      cacheKey &&
    Date.now() -
      aiCache.timestamp <
      AI_CACHE_MS
  ) {
    return aiCache.value;
  }

  try {
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
              process.env
                .DEEPSEEK_MODEL ||
              "deepseek-chat",

            temperature: 0,

            messages: [
              {
                role: "system",
                content: `
You are the analytical layer of a deterministic crypto AI operating system.

You do NOT control execution.

You MUST:
- use only supplied real measurements;
- never invent data;
- never replace null with zero;
- never claim unavailable data is available;
- respect the risk gate;
- keep PAPER execution locked;
- prefer WAIT when required measurements are unavailable.

Return JSON only:
{
  "confidence": number|null,
  "summary": "short English explanation",
  "summaryZh": "short Chinese explanation"
}
                `.trim(),
              },
              {
                role: "user",
                content:
                  JSON.stringify(
                    payload
                  ),
              },
            ],

            response_format: {
              type: "json_object",
            },
          }),
        }
      );

    if (!response.ok) {
      throw new Error(
        `DeepSeek HTTP ${response.status}`
      );
    }

    const data =
      await response.json();

    const content =
      data?.choices?.[0]
        ?.message?.content;

    if (!content) {
      throw new Error(
        "DeepSeek returned empty content"
      );
    }

    const parsed =
      JSON.parse(content);

    const result = {
      provider:
        "deepseek",
      confidence:
        finite(
          parsed?.confidence
        ),
      summary:
        typeof parsed?.summary ===
        "string"
          ? parsed.summary
          : "",
      summaryZh:
        typeof parsed?.summaryZh ===
        "string"
          ? parsed.summaryZh
          : "",
    };

    aiCache = {
      timestamp: Date.now(),
      key: cacheKey,
      value: result,
    };

    return result;
  } catch (error) {
    console.error(
      "DeepSeek error:",
      error?.message || error
    );

    return {
      provider:
        "deterministic",
      confidence: null,
      summary:
        "AI analysis unavailable. Deterministic logic remains authoritative.",
      summaryZh:
        "AI 分析当前不可用，以确定性逻辑为准。",
    };
  }
}

async function analyzeMarket(
  market
) {
  const agents = {
    market:
      marketAgent(market),

    liquidity:
      liquidityAgent(market),

    flow:
      flowAgent(market),

    event:
      eventAgent(),

    risk:
      riskAgent(market),

    execution:
      executionAgent(),
  };

  const decision =
    deterministicDecision(
      market,
      agents
    );

  const ai =
    await requestDeepSeek(
      market,
      agents,
      decision
    );

  /*
   * Risk remains authoritative
   * even when AI says otherwise.
   */
  const finalDecision =
    agents.risk?.blocked
      ? {
          action: "WAIT",
          reason:
            agents.risk
              .summary,
          reasonZh:
            agents.risk
              .summaryZh,
        }
      : decision;

  return {
    ...market,

    agents,

    decision:
      finalDecision,

    ai,

    mode: "PAPER",

    execution: {
      enabled: false,
      locked: true,
      mode: "PAPER",
    },

    risk: {
      state:
        agents.risk
          ?.state ||
        "risk",
      blocked:
        agents.risk
          ?.blocked !==
        false,
    },

    timestamp:
      Date.now(),
  };
}

async function runAgents(
  symbol
) {
  try {
    const market =
      await collectMarket(
        symbol
      );

    return await analyzeMarket(
      market
    );
  } catch (error) {
    console.error(
      `runAgents ${symbol} error:`,
      error?.message || error
    );

    /*
     * IMPORTANT:
     *
     * Failure does NOT become
     * fake zero values.
     */
    const unavailableMarket = {
      symbol,

      market: {
        price: null,
        trend5m: null,
        source: null,
        available: false,
      },

      metrics: {
        liquidity: {
          bidDepth: null,
          askDepth: null,
          imbalance: null,
          available: false,
        },

        flow: {
          buyVolume: null,
          sellVolume: null,
          imbalance: null,
          trades: null,
          available: false,
        },
      },

      sources: {
        price: null,
        liquidity: null,
        flow: null,
      },

      timestamp:
        Date.now(),
    };

    const agents = {
      market: {
        state: "locked",
        role: "Market Structure",
        summary:
          "Market data unavailable.",
        summaryZh:
          "市场数据不可用。",
      },

      liquidity: {
        state: "locked",
        role: "Liquidity Depth",
        summary:
          "Real order-book data unavailable.",
        summaryZh:
          "真实盘口数据不可用。",
      },

      flow: {
        state: "locked",
        role: "Order Flow",
        summary:
          "Real trade-flow data unavailable.",
        summaryZh:
          "真实成交流数据不可用。",
      },

      event: eventAgent(),

      risk: {
        state: "risk",
        role: "Risk Gate",
        blocked: true,
        summary:
          "Risk gate is blocking directional action because required market data is unavailable.",
        summaryZh:
          "必要市场数据不可用，风险门阻止方向性操作。",
      },

      execution:
        executionAgent(),
    };

    return {
      ...unavailableMarket,

      agents,

      decision: {
        action: "WAIT",
        reason:
          "Required real market data is unavailable.",
        reasonZh:
          "必要的真实市场数据不可用。",
      },

      ai: {
        provider:
          "deterministic",
        confidence: null,
        summary:
          "AI analysis unavailable because required real data is unavailable.",
        summaryZh:
          "由于必要真实数据不可用，AI 分析不可用。",
      },

      mode: "PAPER",

      execution: {
        enabled: false,
        locked: true,
        mode: "PAPER",
      },

      risk: {
        state: "risk",
        blocked: true,
      },

      timestamp:
        Date.now(),
    };
  }
}

export async function getMarketState(
  symbol = "HYPE"
) {
  const normalized =
    String(symbol)
      .toUpperCase();

  if (!ASSETS[normalized]) {
    throw new Error(
      `Unsupported asset: ${normalized}`
    );
  }

  return runAgents(
    normalized
  );
}

export async function getAllMarketStates() {
  const symbols =
    Object.keys(ASSETS);

  const results =
    await Promise.all(
      symbols.map(
        async (symbol) => [
          symbol,
          await runAgents(
            symbol
          ),
        ]
      )
    );

  return Object.fromEntries(
    results
  );
}

export {
  ASSETS,
  collectMarket,
  analyzeMarket,
  runAgents,
};