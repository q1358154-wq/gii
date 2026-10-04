import { NextResponse } from "next/server";
import { runAgents } from "../../../lib/agents";

export const dynamic = "force-dynamic";
export const revalidate = 0;

let cachedData = null;
let cachedAt = 0;
let updating = null;

const CACHE_MS = 8000;

async function getData() {
  const now = Date.now();

  if (
    cachedData &&
    now - cachedAt < CACHE_MS
  ) {
    return cachedData;
  }

  if (updating) {
    return updating;
  }

  updating = runAgents()
    .then((data) => {
      cachedData = data;
      cachedAt = Date.now();

      return data;
    })
    .finally(() => {
      updating = null;
    });

  return updating;
}

export async function GET() {
  try {
    const data = await getData();

    return NextResponse.json(data, {
      headers: {
        "Cache-Control":
          "no-store, max-age=0",
      },
    });
  } catch (error) {
    console.error(
      "AI state error:",
      error
    );

    if (cachedData) {
      return NextResponse.json(
        cachedData,
        {
          headers: {
            "Cache-Control":
              "no-store, max-age=0",
          },
        }
      );
    }

    return NextResponse.json(
      {
        timestamp: Date.now(),

        mode: "PAPER",

        market: {
          symbol: "HYPE",
          price: null,
          trend5m: null,
        },

        decision: {
          action: "WAIT",
          reason:
            "Market analysis is temporarily unavailable.",
        },

        ai: {
          summary:
            "Waiting for live market analysis.",
          confidence: null,
          provider: "deterministic",
        },

        agents: {
          market: {
            state: "normal",
            summary:
              "Waiting for market data.",
          },

          liquidity: {
            state: "normal",
            summary:
              "Waiting for liquidity data.",
          },

          flow: {
            state: "normal",
            summary:
              "Waiting for order-flow data.",
          },

          event: {
            state: "normal",
            summary:
              "No external event provider is connected.",
          },

          risk: {
            state: "normal",
            summary:
              "Risk gate is waiting for market data.",
          },

          execution: {
            state: "locked",
            summary:
              "Execution is locked in PAPER MODE.",
          },
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
      },
      {
        status: 200,
        headers: {
          "Cache-Control":
            "no-store, max-age=0",
        },
      }
    );
  }
}