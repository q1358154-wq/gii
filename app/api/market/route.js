import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const HYPERLIQUID_INFO_URL =
  "https://api.hyperliquid.xyz/info";

export async function GET() {
  try {
    const response = await fetch(
      HYPERLIQUID_INFO_URL,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          type: "allMids",
        }),
        cache: "no-store",
      }
    );

    if (!response.ok) {
      throw new Error(
        `Hyperliquid HTTP ${response.status}`
      );
    }

    const data = await response.json();

    const price = Number(data?.HYPE);

    if (!Number.isFinite(price) || price <= 0) {
      throw new Error(
        "HYPE price not found"
      );
    }

    return NextResponse.json({
      symbol: "HYPE",
      price,
      timestamp: Date.now(),
      source: "Hyperliquid",
      mode: "PAPER",
    });
  } catch (error) {
    console.error(
      "HYPE market API error:",
      error
    );

    return NextResponse.json(
      {
        symbol: "HYPE",
        price: null,
        timestamp: Date.now(),
        source: "Hyperliquid",
        mode: "PAPER",
        error:
          "Unable to fetch HYPE price.",
      },
      {
        status: 503,
      }
    );
  }
}