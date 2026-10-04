"use client";

import { useEffect, useMemo, useState } from "react";

const AGENTS = [
  {
    id: "market",
    name: "MARKET",
    role: "Market Structure",
    short: "MKT",
  },
  {
    id: "liquidity",
    name: "LIQUIDITY",
    role: "Liquidity Depth",
    short: "LIQ",
  },
  {
    id: "flow",
    name: "ORDER FLOW",
    role: "Order Flow",
    short: "FLOW",
  },
  {
    id: "event",
    name: "EVENT",
    role: "External Events",
    short: "EVT",
  },
  {
    id: "risk",
    name: "RISK",
    role: "Risk Gate",
    short: "RISK",
  },
  {
    id: "execution",
    name: "EXECUTION",
    role: "Execution Engine",
    short: "EXE",
  },
];

const POSITIONS = [
  [12, 30],
  [32, 68],
  [51, 30],
  [70, 68],
  [51, 82],
  [88, 28],
];

const ROUTES = [
  [0, 1],
  [1, 2],
  [2, 3],
  [3, 4],
  [4, 5],
];

const DEFAULT_STATE = {
  mode: "PAPER",

  market: {
    symbol: "HYPE",
    price: null,
    trend5m: null,
  },

  decision: {
    action: "WAIT",
    reason:
      "Waiting for live market analysis.",
  },

  ai: {
    summary:
      "Deterministic agents are waiting for market data.",
    confidence: null,
    provider: "deterministic",
  },

  agents: Object.fromEntries(
    AGENTS.map((agent) => [
      agent.id,
      {
        state:
          agent.id === "execution"
            ? "locked"
            : "normal",
        summary:
          agent.id === "execution"
            ? "Execution is locked in PAPER MODE."
            : "Waiting for analysis.",
      },
    ])
  ),

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

function stateClass(state) {
  switch (state) {
    case "positive":
      return "positive";

    case "warning":
      return "warning";

    case "risk":
      return "risk";

    case "locked":
      return "locked";

    default:
      return "normal";
  }
}

function stateLabel(state) {
  switch (state) {
    case "positive":
      return "SUPPORTIVE";

    case "warning":
      return "WARNING";

    case "risk":
      return "RISK";

    case "locked":
      return "LOCKED";

    default:
      return "NORMAL";
  }
}

function routeState(a, b) {
  const states = [a, b];

  if (states.includes("risk")) {
    return "risk";
  }

  if (states.includes("warning")) {
    return "warning";
  }

  if (states.includes("locked")) {
    return "locked";
  }

  if (states.includes("positive")) {
    return "positive";
  }

  return "normal";
}

function formatPrice(value) {
  if (
    typeof value !== "number" ||
    !Number.isFinite(value)
  ) {
    return "—";
  }

  return `$${value.toLocaleString(
    "en-US",
    {
      minimumFractionDigits: 2,
      maximumFractionDigits: 4,
    }
  )}`;
}

function formatPercent(value) {
  if (
    typeof value !== "number" ||
    !Number.isFinite(value)
  ) {
    return "—";
  }

  return `${value >= 0 ? "+" : ""}${value.toFixed(
    2
  )}%`;
}

function formatNumber(value) {
  if (
    typeof value !== "number" ||
    !Number.isFinite(value)
  ) {
    return "—";
  }

  return value.toLocaleString(
    "en-US",
    {
      maximumFractionDigits: 2,
    }
  );
}

function AgentNode({
  agent,
  index,
  state,
  active,
  onClick,
}) {
  const [left, top] = POSITIONS[index];

  return (
    <button
      type="button"
      className={`agent agent-${index} ${active ? "active" : ""} ${stateClass(
        state
      )}`}
      style={{
        left: `${left}%`,
        top: `${top}%`,
      }}
      onClick={onClick}
      aria-label={`${agent.name} agent`}
    >
      <div className="agent-node">
        <div className="agent-ring" />

        <div className="agent-core">
          <span>{agent.short}</span>
        </div>
      </div>

      <div className="agent-name">
        {agent.name}
      </div>

      <div className="agent-role">
        {agent.role}
      </div>

      <div className="agent-state">
        {stateLabel(state)}
      </div>
    </button>
  );
}

function ConnectionLines({ states }) {
  return (
    <svg
      className="network-lines"
      viewBox="0 0 100 100"
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      {ROUTES.map(([from, to]) => {
        const [x1, y1] = POSITIONS[from];
        const [x2, y2] = POSITIONS[to];

        const state = routeState(
          states[from],
          states[to]
        );

        return (
          <line
            key={`${from}-${to}`}
            x1={x1}
            y1={y1}
            x2={x2}
            y2={y2}
            className={`line-${state}`}
          />
        );
      })}
    </svg>
  );
}

export default function AgentCommandCenter() {
  const [state, setState] =
    useState(DEFAULT_STATE);

  const [activeAgent, setActiveAgent] =
    useState(0);

  const [connected, setConnected] =
    useState(false);

  const [lastUpdate, setLastUpdate] =
    useState(null);

  const [logs, setLogs] = useState([]);

  const [showWhy, setShowWhy] =
    useState(false);

  const [paused, setPaused] =
    useState(false);

  /*
   * =========================
   * EVENT STREAM
   * =========================
   */

  useEffect(() => {
    if (paused) {
      return undefined;
    }

    let source;
    let reconnectTimer;

    const connect = () => {
      source = new EventSource(
        "/api/events"
      );

      source.addEventListener(
        "connected",
        () => {
          setConnected(true);
        }
      );

      source.addEventListener(
        "state",
        (event) => {
          try {
            const next =
              JSON.parse(event.data);

            setState(next);
            setConnected(true);
            setLastUpdate(
              Date.now()
            );

            setLogs((previous) => {
              const entry = {
                timestamp:
                  Date.now(),
                action:
                  next?.decision?.action ||
                  "WAIT",
                reason:
                  next?.decision?.reason ||
                  "",
              };

              return [
                entry,
                ...previous,
              ].slice(0, 8);
            });
          } catch (error) {
            console.error(
              "Invalid SSE state:",
              error
            );
          }
        }
      );

      source.addEventListener(
        "heartbeat",
        () => {
          setConnected(true);
          setLastUpdate(
            Date.now()
          );
        }
      );

      source.addEventListener(
        "error",
        () => {
          setConnected(false);

          if (source) {
            source.close();
          }

          reconnectTimer =
            setTimeout(
              connect,
              3000
            );
        }
      );
    };

    connect();

    return () => {
      if (source) {
        source.close();
      }

      if (reconnectTimer) {
        clearTimeout(
          reconnectTimer
        );
      }
    };
  }, [paused]);

  /*
   * =========================
   * ACTIVE AGENT
   * =========================
   */

  useEffect(() => {
    if (paused) return undefined;

    const timer = setInterval(() => {
      setActiveAgent(
        (value) =>
          (value + 1) %
          AGENTS.length
      );
    }, 1600);

    return () =>
      clearInterval(timer);
  }, [paused]);

  const agentStates = useMemo(
    () =>
      AGENTS.map(
        (agent) =>
          state?.agents?.[agent.id]
            ?.state || "normal"
      ),
    [state]
  );

  const activeData =
    state?.agents?.[
      AGENTS[activeAgent]?.id
    ];

  const action =
    state?.decision?.action ||
    "WAIT";

  const confidence =
    state?.ai?.confidence;

  const marketPrice =
    state?.market?.price;

  const trend =
    state?.market?.trend5m;

  const liquidity =
    state?.metrics?.liquidity;

  const flow =
    state?.metrics?.flow;

  const provider =
    state?.ai?.provider ||
    "deterministic";

  return (
    <main className="os-shell">
      <header className="topbar">
        <div>
          <div className="eyebrow">
            CRYPTO AI OS / V4
          </div>

          <h1>
            Agent Command Center
          </h1>
        </div>

        <div className="top-actions">
          <span
            className={`status-dot ${
              connected ? "live" : ""
            }`}
          />

          <span>
            {connected
              ? "EVENT STREAM"
              : "OFFLINE"}
          </span>

          <span className="mode">
            {state?.mode ||
              "PAPER"}
          </span>

          <button
            type="button"
            onClick={() =>
              setPaused(
                (value) => !value
              )
            }
          >
            {paused
              ? "RESUME"
              : "PAUSE"}
          </button>
        </div>
      </header>

      <section className="hero-grid">
        <div className="glass market-card">
          <div className="card-label">
            REAL MARKET DATA
          </div>

          <div className="symbol-row">
            <strong>HYPE</strong>

            <span className="mode">
              HYPERLIQUID
            </span>
          </div>

          <div className="price">
            {formatPrice(
              marketPrice
            )}
          </div>

          <div className="subline">
            <span>
              Structure{" "}
              {formatPercent(
                trend
              )}
            </span>

            <span>
              {connected
                ? "LIVE"
                : "WAITING"}
            </span>
          </div>
        </div>

        <div className="glass decision-card">
          <div className="card-label">
            DECISION STATE
          </div>

          <div className="decision">
            {action}
          </div>

          <p>
            {state?.decision
              ?.reason ||
              "Waiting for decision state."}
          </p>

          <div className="decision-line">
            <span>
              AI /{" "}
              {provider}
            </span>

            <span>
              Confidence{" "}
              {confidence ??
                "—"}
              {confidence !==
                null &&
                confidence !==
                  undefined
                ? "%"
                : ""}
            </span>

            <button
              type="button"
              onClick={() =>
                setShowWhy(
                  (value) =>
                    !value
                )
              }
            >
              {showWhy
                ? "HIDE"
                : "WHY"}
            </button>
          </div>

          {showWhy && (
            <div className="why-box">
              {state?.ai
                ?.summary ||
                "No additional AI explanation available."}
            </div>
          )}
        </div>

        <div className="glass treasury-card">
          <div className="card-label">
            TREASURY
          </div>

          <div className="treasury-row">
            <span>
              Wallet
            </span>

            <strong>
              NOT CONNECTED
            </strong>
          </div>

          <div className="treasury-row">
            <span>
              Balance
            </span>

            <strong>
              NOT TRACKED
            </strong>
          </div>

          <div className="treasury-row">
            <span>
              P&L
            </span>

            <strong>
              NOT TRACKED
            </strong>
          </div>

          <div className="treasury-row">
            <span>
              Execution
            </span>

            <strong>
              PAPER LOCKED
            </strong>
          </div>
        </div>
      </section>

      <section className="glass network">
        <div className="section-head">
          <div>
            <div className="card-label">
              AGENT NETWORK
            </div>

            <h2>
              Deterministic Intelligence
            </h2>
          </div>

          <div className="loop-counter">
            {lastUpdate
              ? `UPDATED ${new Date(
                  lastUpdate
                ).toLocaleTimeString()}`
              : "WAITING"}
          </div>
        </div>

        <div className="network-stage">
          <ConnectionLines
            states={
              agentStates
            }
          />

          {AGENTS.map(
            (agent, index) => (
              <AgentNode
                key={
                  agent.id
                }
                agent={
                  agent
                }
                index={
                  index
                }
                state={
                  agentStates[
                    index
                  ]
                }
                active={
                  index ===
                  activeAgent
                }
                onClick={() =>
                  setActiveAgent(
                    index
                  )
                }
              />
            )
          )}

          <div className="network-center">
            <div className="network-center-label">
              EVENT / STATE
            </div>

            <strong>
              {connected
                ? "CONNECTED"
                : "WAITING"}
            </strong>

            <span>
              SSE
            </span>
          </div>
        </div>
      </section>

      <section className="bottom-grid">
        <div className="glass logs">
          <div className="section-head">
            <div>
              <div className="card-label">
                ACTIVE AGENT
              </div>

              <h2>
                {AGENTS[
                  activeAgent
                ]?.name ||
                  "AGENT"}
              </h2>
            </div>

            <span className="feed-live">
              {state?.agents?.[
                AGENTS[
                  activeAgent
                ]?.id
              ]?.state
                ? state
                    .agents[
                      AGENTS[
                        activeAgent
                      ]?.id
                    ]
                    .state
                    .toUpperCase()
                : "WAITING"}
            </span>
          </div>

          <div className="agent-detail">
            <div className="agent-detail-role">
              {
                AGENTS[
                  activeAgent
                ]?.role
              }
            </div>

            <p>
              {activeData
                ?.summary ||
                "Waiting for live agent analysis."}
            </p>
          </div>

          <div className="feed">
            {logs.length ===
            0 ? (
              <div className="feed-empty">
                Waiting for first
                event...
              </div>
            ) : (
              logs.map(
                (
                  item,
                  index
                ) => (
                  <div
                    className="feed-row"
                    key={`${item.timestamp}-${index}`}
                  >
                    <span>
                      {new Date(
                        item.timestamp
                      ).toLocaleTimeString()}
                    </span>

                    <strong>
                      {
                        item.action
                      }
                    </strong>

                    <p>
                      {
                        item.reason
                      }
                    </p>
                  </div>
                )
              )
            )}
          </div>
        </div>

        <div className="glass rules">
          <div className="card-label">
            V4 CONTROL RULES
          </div>

          <div className="rule">
            <span>
              REAL DATA
            </span>

            <strong>
              ACTIVE
            </strong>
          </div>

          <div className="rule">
            <span>
              DETERMINISTIC LOGIC
            </span>

            <strong>
              ACTIVE
            </strong>
          </div>

          <div className="rule">
            <span>
              RISK PRIORITY
            </span>

            <strong>
              ACTIVE
            </strong>
          </div>

          <div className="rule">
            <span>
              AI EXECUTION
            </span>

            <strong>
              BLOCKED
            </strong>
          </div>

          <div className="rule">
            <span>
              LIVE EXECUTION
            </span>

            <strong>
              LOCKED
            </strong>
          </div>

          <div className="rule">
            <span>
              EVENT STREAM
            </span>

            <strong>
              {connected
                ? "LIVE"
                : "WAITING"}
            </strong>
          </div>

          <div className="metrics">
            <div>
              <span>
                BID DEPTH
              </span>

              <strong>
                {formatNumber(
                  liquidity?.bidDepth
                )}
              </strong>
            </div>

            <div>
              <span>
                ASK DEPTH
              </span>

              <strong>
                {formatNumber(
                  liquidity?.askDepth
                )}
              </strong>
            </div>

            <div>
              <span>
                BOOK IMBALANCE
              </span>

              <strong>
                {formatPercent(
                  (liquidity
                    ?.imbalance ||
                    0) *
                    100
                )}
              </strong>
            </div>

            <div>
              <span>
                FLOW
              </span>

              <strong>
                {formatPercent(
                  (flow
                    ?.imbalance ||
                    0) *
                    100
                )}
              </strong>
            </div>

            <div>
              <span>
                TRADES
              </span>

              <strong>
                {formatNumber(
                  flow?.trades
                )}
              </strong>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}