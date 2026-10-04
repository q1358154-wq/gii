"use client";

import { useEffect, useMemo, useState } from "react";

const ASSETS = [
  { id: "HYPE", name: "HYPE", venue: "Hyperliquid", icon: "H" },
  { id: "SUI", name: "SUI", venue: "Market Data", icon: "◆" },
  { id: "JITOSOL", name: "JitoSOL", venue: "Market Data", icon: "J" },
];

const AGENTS = [
  { id: "market", name: "MARKET", role: "Market Structure", short: "MKT" },
  { id: "liquidity", name: "LIQUIDITY", role: "Liquidity Depth", short: "LIQ" },
  { id: "flow", name: "ORDER FLOW", role: "Order Flow", short: "FLOW" },
  { id: "event", name: "EVENT", role: "External Events", short: "EVT" },
  { id: "risk", name: "RISK", role: "Risk Gate", short: "RISK" },
  { id: "execution", name: "EXECUTION", role: "Execution Engine", short: "EXE" },
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

const T = {
  zh: {
    command: "智能代理控制中心",
    stream: "事件流",
    offline: "离线",
    pause: "暂停",
    resume: "继续",
    live: "实时",
    waiting: "等待",
    real: "真实市场数据",
    structure: "结构",
    decision: "决策状态",
    confidence: "信心",
    why: "为什么",
    hide: "隐藏",
    treasury: "资金库",
    wallet: "钱包",
    balance: "余额",
    pnl: "盈亏",
    execution: "执行",
    notConnected: "未连接",
    notTracked: "未追踪",
    paperLocked: "纸面模式锁定",
    network: "代理网络",
    intelligence: "确定性智能",
    updated: "更新于",
    connected: "已连接",
    active: "当前代理",
    rules: "V4 控制规则",
    realData: "真实数据",
    deterministic: "确定性逻辑",
    riskPriority: "风险优先",
    aiExecution: "AI 执行",
    blocked: "阻止",
    liveExecution: "实时执行",
    locked: "锁定",
    eventStream: "事件流",
    bid: "买方深度",
    ask: "卖方深度",
    imbalance: "盘口失衡",
    flow: "订单流",
    trades: "成交笔数",
    noExplanation: "暂无额外 AI 解释。",
    waitingAnalysis: "等待实时代理分析。",
    firstEvent: "等待第一个事件……",
    paper: "纸面模式",
    supportive: "支持",
    warning: "警告",
    risk: "风险",
    normal: "正常",
    deterministicProvider: "确定性",
    reasonWaiting: "等待实时市场分析。",
    unavailable: "不可用",
    marketStructure: "市场结构",
    liquidityDepth: "流动性深度",
    orderFlow: "订单流",
    externalEvents: "外部事件",
    riskGate: "风险门",
    executionEngine: "执行引擎",
  },

  en: {
    command: "Agent Command Center",
    stream: "EVENT STREAM",
    offline: "OFFLINE",
    pause: "PAUSE",
    resume: "RESUME",
    live: "LIVE",
    waiting: "WAITING",
    real: "REAL MARKET DATA",
    structure: "Structure",
    decision: "DECISION STATE",
    confidence: "Confidence",
    why: "WHY",
    hide: "HIDE",
    treasury: "TREASURY",
    wallet: "Wallet",
    balance: "Balance",
    pnl: "P&L",
    execution: "Execution",
    notConnected: "NOT CONNECTED",
    notTracked: "NOT TRACKED",
    paperLocked: "PAPER LOCKED",
    network: "AGENT NETWORK",
    intelligence: "Deterministic Intelligence",
    updated: "UPDATED",
    connected: "CONNECTED",
    active: "ACTIVE AGENT",
    rules: "V4 CONTROL RULES",
    realData: "REAL DATA",
    deterministic: "DETERMINISTIC LOGIC",
    riskPriority: "RISK PRIORITY",
    aiExecution: "AI EXECUTION",
    blocked: "BLOCKED",
    liveExecution: "LIVE EXECUTION",
    locked: "LOCKED",
    eventStream: "EVENT STREAM",
    bid: "BID DEPTH",
    ask: "ASK DEPTH",
    imbalance: "BOOK IMBALANCE",
    flow: "FLOW",
    trades: "TRADES",
    noExplanation: "No additional AI explanation available.",
    waitingAnalysis: "Waiting for live agent analysis.",
    firstEvent: "Waiting for first event...",
    paper: "PAPER",
    supportive: "SUPPORTIVE",
    warning: "WARNING",
    risk: "RISK",
    normal: "NORMAL",
    deterministicProvider: "deterministic",
    reasonWaiting: "Waiting for live market analysis.",
    unavailable: "UNAVAILABLE",
    marketStructure: "Market Structure",
    liquidityDepth: "Liquidity Depth",
    orderFlow: "Order Flow",
    externalEvents: "External Events",
    riskGate: "Risk Gate",
    executionEngine: "Execution Engine",
  },
};

function stateClass(state) {
  return ["positive", "warning", "risk", "locked"].includes(state)
    ? state
    : "normal";
}

function stateLabel(state, t) {
  if (state === "positive") return t.supportive;
  if (state === "warning") return t.warning;
  if (state === "risk") return t.risk;
  if (state === "locked") return t.locked;
  return t.normal;
}

function routeState(a, b) {
  const states = [a, b];

  if (states.includes("risk")) return "risk";
  if (states.includes("warning")) return "warning";
  if (states.includes("locked")) return "locked";
  if (states.includes("positive")) return "positive";

  return "normal";
}

function formatPrice(value) {
  if (!Number.isFinite(Number(value))) return "—";

  return `$${Number(value).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 6,
  })}`;
}

function formatPercent(value) {
  if (!Number.isFinite(Number(value))) return "—";

  const number = Number(value);

  return `${number >= 0 ? "+" : ""}${number.toFixed(2)}%`;
}

function formatNumber(value) {
  if (!Number.isFinite(Number(value))) return "—";

  return Number(value).toLocaleString("en-US", {
    maximumFractionDigits: 2,
  });
}

function localizedText(item, lang, fallback = "") {
  if (!item) return fallback;

  if (lang === "zh") {
    return item.summaryZh || item.summary || fallback;
  }

  return item.summary || fallback;
}

function localizedReason(decision, lang, fallback) {
  if (!decision) return fallback;

  if (lang === "zh") {
    return decision.reasonZh || decision.reason || fallback;
  }

  return decision.reason || fallback;
}

function AssetIcon({ asset }) {
  return (
    <span
      className={`asset-icon asset-icon-${asset.id.toLowerCase()}`}
      aria-hidden="true"
    >
      {asset.icon}
    </span>
  );
}

function AgentNode({
  agent,
  index,
  state,
  active,
  onClick,
  t,
}) {
  const [left, top] = POSITIONS[index];

  const roleKey =
    agent.id === "market"
      ? "marketStructure"
      : agent.id === "liquidity"
        ? "liquidityDepth"
        : agent.id === "flow"
          ? "orderFlow"
          : agent.id === "event"
            ? "externalEvents"
            : agent.id === "risk"
              ? "riskGate"
              : "executionEngine";

  return (
    <button
      type="button"
      className={`agent agent-${index} ${
        active ? "active" : ""
      } ${stateClass(state)}`}
      style={{
        left: `${left}%`,
        top: `${top}%`,
      }}
      onClick={onClick}
    >
      <div className="agent-node">
        <div className="agent-ring" />
        <div className="agent-core">
          <span>{agent.short}</span>
        </div>
      </div>

      <div className="agent-name">{agent.name}</div>
      <div className="agent-role">{t[roleKey]}</div>
      <div className="agent-state">
        {stateLabel(state, t)}
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
      {ROUTES.map(([a, b]) => {
        const [x1, y1] = POSITIONS[a];
        const [x2, y2] = POSITIONS[b];

        return (
          <line
            key={`${a}-${b}`}
            x1={x1}
            y1={y1}
            x2={x2}
            y2={y2}
            className={`line-${routeState(
              states[a],
              states[b]
            )}`}
          />
        );
      })}
    </svg>
  );
}

export default function AgentCommandCenter() {
  const [lang, setLang] = useState("zh");
  const [selected, setSelected] = useState("HYPE");
  const [state, setState] = useState(null);
  const [activeAgent, setActiveAgent] = useState(0);
  const [connected, setConnected] = useState(false);
  const [lastUpdate, setLastUpdate] = useState(null);
  const [logs, setLogs] = useState([]);
  const [showWhy, setShowWhy] = useState(false);
  const [paused, setPaused] = useState(false);

  const t = T[lang];

  useEffect(() => {
    try {
      const saved = localStorage.getItem(
        "crypto-ai-lang"
      );

      if (saved === "zh" || saved === "en") {
        setLang(saved);
      }
    } catch {}
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(
        "crypto-ai-lang",
        lang
      );
    } catch {}
  }, [lang]);

  useEffect(() => {
    if (paused) return;

    let source;
    let reconnectTimer;

    const connect = () => {
      source = new EventSource(
        `/api/events?symbol=${encodeURIComponent(
          selected
        )}`
      );

      source.addEventListener("connected", () => {
        setConnected(true);
      });

      source.addEventListener("state", (event) => {
        try {
          const next = JSON.parse(event.data);

          const market =
            next?.markets?.[selected] || next;

          setState(next);
          setConnected(true);
          setLastUpdate(Date.now());

          setLogs((previous) => [
            {
              timestamp: Date.now(),
              action:
                market?.decision?.action || "WAIT",
              reason: market?.decision?.reason || "",
              reasonZh:
                market?.decision?.reasonZh || "",
            },
            ...previous,
          ].slice(0, 8));
        } catch (error) {
          console.error(
            "Invalid SSE state:",
            error
          );
        }
      });

      source.addEventListener(
        "heartbeat",
        () => {
          setConnected(true);
          setLastUpdate(Date.now());
        }
      );

      source.addEventListener("error", () => {
        setConnected(false);
        source?.close();

        reconnectTimer = setTimeout(
          connect,
          3000
        );
      });
    };

    connect();

    return () => {
      source?.close();

      if (reconnectTimer) {
        clearTimeout(reconnectTimer);
      }
    };
  }, [paused, selected]);

  useEffect(() => {
    if (paused) return;

    const timer = setInterval(() => {
      setActiveAgent(
        (value) =>
          (value + 1) % AGENTS.length
      );
    }, 1600);

    return () => clearInterval(timer);
  }, [paused]);

  const market =
    state?.markets?.[selected] || state || {};

  const agents = market?.agents || {};

  const agentStates = useMemo(
    () =>
      AGENTS.map(
        (agent) =>
          agents?.[agent.id]?.state ||
          "normal"
      ),
    [agents]
  );

  const activeData =
    agents?.[AGENTS[activeAgent]?.id];

  const action =
    market?.decision?.action || "WAIT";

  const confidence =
    market?.ai?.confidence;

  const provider =
    market?.ai?.provider ||
    t.deterministicProvider;

  const liquidity =
    market?.metrics?.liquidity || {};

  const flow =
    market?.metrics?.flow || {};

  const asset =
    ASSETS.find(
      (item) => item.id === selected
    ) || ASSETS[0];

  return (
    <main className="os-shell">
      <header className="topbar">
        <div>
          <div className="eyebrow">
            CRYPTO AI OS / V4
          </div>

          <h1>{t.command}</h1>
        </div>

        <div className="top-actions">
          <button
            type="button"
            className="language-switch"
            onClick={() =>
              setLang((value) =>
                value === "zh"
                  ? "en"
                  : "zh"
              )
            }
          >
            {lang === "zh" ? "EN" : "中"}
          </button>

          <span
            className={`status-dot ${
              connected ? "live" : ""
            }`}
          />

          <span>
            {connected
              ? t.stream
              : t.offline}
          </span>

          <span className="mode">
            {state?.mode || t.paper}
          </span>

          <button
            type="button"
            onClick={() =>
              setPaused((value) => !value)
            }
          >
            {paused ? t.resume : t.pause}
          </button>
        </div>
      </header>

      <section className="hero-grid">
        <div className="glass market-card">
          <div className="card-label">
            {t.real}
          </div>

          <div className="symbol-row">
            <div className="asset-selector">
              {ASSETS.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className={
                    selected === item.id
                      ? "selected"
                      : ""
                  }
                  onClick={() =>
                    setSelected(item.id)
                  }
                >
                  <AssetIcon asset={item} />
                  <strong>{item.name}</strong>
                </button>
              ))}
            </div>

            <span className="mode">
              {asset.venue}
            </span>
          </div>

          <div className="price">
            {formatPrice(
              market?.market?.price
            )}
          </div>

          <div className="subline">
            <span>
              {t.structure}{" "}
              {formatPercent(
                market?.market?.trend5m
              )}
            </span>

            <span>
              {connected
                ? t.live
                : t.waiting}
            </span>
          </div>
        </div>

        <div className="glass decision-card">
          <div className="card-label">
            {t.decision}
          </div>

          <div className="decision">
            {action}
          </div>

          <p>
            {localizedReason(
              market?.decision,
              lang,
              t.reasonWaiting
            )}
          </p>

          <div className="decision-line">
            <span>
              AI / {provider}
            </span>

            <span>
              {t.confidence}{" "}
              {confidence ?? "—"}
              {confidence != null
                ? "%"
                : ""}
            </span>

            <button
              type="button"
              onClick={() =>
                setShowWhy(
                  (value) => !value
                )
              }
            >
              {showWhy ? t.hide : t.why}
            </button>
          </div>

          {showWhy && (
            <div className="why-box">
              {lang === "zh"
                ? market?.ai?.summaryZh ||
                  market?.ai?.summary ||
                  t.noExplanation
                : market?.ai?.summary ||
                  t.noExplanation}
            </div>
          )}
        </div>

        <div className="glass treasury-card">
          <div className="card-label">
            {t.treasury}
          </div>

          <div className="treasury-row">
            <span>{t.wallet}</span>
            <strong>
              {t.notConnected}
            </strong>
          </div>

          <div className="treasury-row">
            <span>{t.balance}</span>
            <strong>
              {t.notTracked}
            </strong>
          </div>

          <div className="treasury-row">
            <span>{t.pnl}</span>
            <strong>
              {t.notTracked}
            </strong>
          </div>

          <div className="treasury-row">
            <span>{t.execution}</span>
            <strong>
              {t.paperLocked}
            </strong>
          </div>
        </div>
      </section>

      <section className="glass network">
        <div className="section-head">
          <div>
            <div className="card-label">
              {t.network}
            </div>

            <h2>
              {t.intelligence}
            </h2>
          </div>

          <div className="loop-counter">
            {lastUpdate
              ? `${t.updated} ${new Date(
                  lastUpdate
                ).toLocaleTimeString(
                  lang === "zh"
                    ? "zh-CN"
                    : "en-US"
                )}`
              : t.waiting}
          </div>
        </div>

        <div className="network-stage">
          <ConnectionLines
            states={agentStates}
          />

          {AGENTS.map(
            (agent, index) => (
              <AgentNode
                key={agent.id}
                agent={agent}
                index={index}
                state={
                  agentStates[index]
                }
                active={
                  index === activeAgent
                }
                onClick={() =>
                  setActiveAgent(index)
                }
                t={t}
              />
            )
          )}

          <div className="network-center">
            <div className="network-center-label">
              {t.eventStream}
            </div>

            <strong>
              {connected
                ? t.connected
                : t.waiting}
            </strong>

            <span>SSE</span>
          </div>
        </div>
      </section>

      <section className="bottom-grid">
        <div className="glass logs">
          <div className="section-head">
            <div>
              <div className="card-label">
                {t.active}
              </div>

              <h2>
                {AGENTS[activeAgent]?.name ||
                  "AGENT"}
              </h2>
            </div>

            <span className="feed-live">
              {stateLabel(
                activeData?.state,
                t
              )}
            </span>
          </div>

          <div className="agent-detail">
            <div className="agent-detail-role">
              {activeData?.role ||
                AGENTS[activeAgent]?.role}
            </div>

            <p>
              {localizedText(
                activeData,
                lang,
                t.waitingAnalysis
              )}
            </p>
          </div>

          <div className="feed">
            {logs.length === 0 ? (
              <div className="feed-empty">
                {t.firstEvent}
              </div>
            ) : (
              logs.map(
                (item, index) => (
                  <div
                    className="feed-row"
                    key={`${item.timestamp}-${index}`}
                  >
                    <span>
                      {new Date(
                        item.timestamp
                      ).toLocaleTimeString(
                        lang === "zh"
                          ? "zh-CN"
                          : "en-US"
                      )}
                    </span>

                    <strong>
                      {item.action}
                    </strong>

                    <p>
                      {lang === "zh"
                        ? item.reasonZh ||
                          item.reason
                        : item.reason}
                    </p>
                  </div>
                )
              )
            )}
          </div>
        </div>

        <div className="glass rules">
          <div className="card-label">
            {t.rules}
          </div>

          {[
            [
              "realData",
              t.realData,
              "ACTIVE",
            ],
            [
              "deterministic",
              t.deterministic,
              "ACTIVE",
            ],
            [
              "riskPriority",
              t.riskPriority,
              "ACTIVE",
            ],
            [
              "aiExecution",
              t.aiExecution,
              t.blocked,
            ],
            [
              "liveExecution",
              t.liveExecution,
              t.locked,
            ],
            [
              "eventStream",
              t.eventStream,
              connected
                ? t.live
                : t.waiting,
            ],
          ].map(
            ([key, label, value]) => (
              <div
                className="rule"
                key={key}
              >
                <span>{label}</span>
                <strong>{value}</strong>
              </div>
            )
          )}

          <div className="metrics">
            <div>
              <span>{t.bid}</span>
              <strong>
                {formatNumber(
                  liquidity.bidDepth
                )}
              </strong>
            </div>

            <div>
              <span>{t.ask}</span>
              <strong>
                {formatNumber(
                  liquidity.askDepth
                )}
              </strong>
            </div>

            <div>
              <span>{t.imbalance}</span>
              <strong>
                {formatPercent(
                  Number(
                    liquidity.imbalance || 0
                  ) * 100
                )}
              </strong>
            </div>

            <div>
              <span>{t.flow}</span>
              <strong>
                {formatPercent(
                  Number(
                    flow.imbalance || 0
                  ) * 100
                )}
              </strong>
            </div>

            <div>
              <span>{t.trades}</span>
              <strong>
                {formatNumber(
                  flow.trades
                )}
              </strong>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}