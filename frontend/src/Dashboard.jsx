import { useRef, useEffect, useMemo } from "react";
import { useQuery } from "convex/react";
import { api } from "../convex/_generated/api";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function relativeTime(ts) {
  const diff = Date.now() - ts;
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days === 1) return "yesterday";
  if (days < 30) return `${days} days ago`;
  return new Date(ts).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function startOfWeek(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - d.getDay());
  return d.getTime();
}

function weekLabel(ts) {
  const d = new Date(ts);
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function startOfDay(ts) {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

const STOP_WORDS = new Set([
  "i", "me", "my", "we", "our", "you", "your", "he", "she", "it", "they",
  "the", "a", "an", "is", "am", "are", "was", "were", "be", "been", "being",
  "have", "has", "had", "do", "does", "did", "will", "would", "could",
  "should", "can", "may", "might", "shall", "to", "of", "in", "for", "on",
  "with", "at", "by", "from", "as", "into", "about", "but", "or", "and",
  "if", "so", "not", "no", "that", "this", "what", "which", "who", "how",
  "all", "each", "just", "very", "too", "also", "than", "then", "now",
  "here", "there", "when", "where", "up", "out", "more",
]);

// ─── Data aggregation ────────────────────────────────────────────────────────

function useAggregatedData(sessions, profile, profileVersions) {
  return useMemo(() => {
    if (!sessions || !profile) return null;

    const now = Date.now();
    const weekStart = startOfWeek(now);

    // Sessions this week
    const sessionsThisWeek = sessions.filter((s) => s.created_at >= weekStart).length;

    // Weekly confidence averages (for line chart)
    const weeklyMap = new Map();
    for (const s of sessions) {
      const wk = startOfWeek(s.created_at);
      if (!weeklyMap.has(wk)) weeklyMap.set(wk, { sum: 0, count: 0 });
      const bucket = weeklyMap.get(wk);
      bucket.sum += s.confidence;
      bucket.count += 1;
    }
    const weeklyAvg = [...weeklyMap.entries()]
      .sort(([a], [b]) => a - b)
      .map(([wk, { sum, count }]) => ({
        week: wk,
        label: weekLabel(wk),
        avg: sum / count,
      }));

    // Top phrases — tokenize corrected_text, count non-stop words
    const wordCounts = new Map();
    for (const s of sessions) {
      const words = (s.corrected_text || "")
        .toLowerCase()
        .replace(/[^a-z\u00C0-\u024F\u0400-\u04FF\u4e00-\u9fff\s'-]/g, "")
        .split(/\s+/)
        .filter((w) => w.length > 2 && !STOP_WORDS.has(w));
      for (const w of words) {
        wordCounts.set(w, (wordCounts.get(w) || 0) + 1);
      }
    }
    const topPhrases = [...wordCounts.entries()]
      .sort(([, a], [, b]) => b - a)
      .slice(0, 10);
    const maxPhraseCount = topPhrases.length > 0 ? topPhrases[0][1] : 1;

    // Condition breakdown
    const conditionMap = new Map();
    for (const s of sessions) {
      conditionMap.set(s.condition, (conditionMap.get(s.condition) || 0) + 1);
    }
    const conditionBreakdown = [...conditionMap.entries()].sort(([, a], [, b]) => b - a);

    // Streak — consecutive days with at least one session
    let streak = 0;
    const daySet = new Set(sessions.map((s) => startOfDay(s.created_at)));
    let cursor = startOfDay(now);
    // If no session today, start from yesterday
    if (!daySet.has(cursor)) cursor -= 86_400_000;
    while (daySet.has(cursor)) {
      streak++;
      cursor -= 86_400_000;
    }

    // Profile version
    const latestVersion = profileVersions?.[0] ?? null;
    const versionNumber = profile.summarisation_count ?? 0;

    return {
      sessionsThisWeek,
      weeklyAvg,
      topPhrases,
      maxPhraseCount,
      conditionBreakdown,
      streak,
      versionNumber,
      latestVersion,
    };
  }, [sessions, profile, profileVersions]);
}

// ─── Canvas charts ───────────────────────────────────────────────────────────

function LineChart({ data }) {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || data.length === 0) return;
    const ctx = canvas.getContext("2d");
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);
    const W = rect.width;
    const H = rect.height;

    const pad = { top: 20, right: 16, bottom: 32, left: 36 };
    const plotW = W - pad.left - pad.right;
    const plotH = H - pad.top - pad.bottom;

    const vals = data.map((d) => d.avg);
    const minV = Math.max(0, Math.min(...vals) - 0.05);
    const maxV = Math.min(1, Math.max(...vals) + 0.05);
    const range = maxV - minV || 0.1;

    const x = (i) => pad.left + (i / Math.max(data.length - 1, 1)) * plotW;
    const y = (v) => pad.top + plotH - ((v - minV) / range) * plotH;

    ctx.clearRect(0, 0, W, H);

    // Grid lines
    ctx.strokeStyle = "rgba(255,255,255,0.06)";
    ctx.lineWidth = 1;
    for (let i = 0; i <= 4; i++) {
      const gy = pad.top + (plotH / 4) * i;
      ctx.beginPath();
      ctx.moveTo(pad.left, gy);
      ctx.lineTo(W - pad.right, gy);
      ctx.stroke();
    }

    // Y-axis labels
    ctx.fillStyle = "#9ca3af";
    ctx.font = "11px system-ui, sans-serif";
    ctx.textAlign = "right";
    for (let i = 0; i <= 4; i++) {
      const v = maxV - (range / 4) * i;
      const gy = pad.top + (plotH / 4) * i;
      ctx.fillText((v * 100).toFixed(0) + "%", pad.left - 6, gy + 4);
    }

    // X-axis labels
    ctx.textAlign = "center";
    const step = Math.max(1, Math.floor(data.length / 6));
    for (let i = 0; i < data.length; i += step) {
      ctx.fillText(data[i].label, x(i), H - 6);
    }
    if (data.length > 1) {
      ctx.fillText(data[data.length - 1].label, x(data.length - 1), H - 6);
    }

    // Gradient fill
    const grad = ctx.createLinearGradient(0, pad.top, 0, pad.top + plotH);
    grad.addColorStop(0, "rgba(192, 132, 252, 0.25)");
    grad.addColorStop(1, "rgba(192, 132, 252, 0.02)");
    ctx.beginPath();
    ctx.moveTo(x(0), y(vals[0]));
    for (let i = 1; i < vals.length; i++) ctx.lineTo(x(i), y(vals[i]));
    ctx.lineTo(x(vals.length - 1), pad.top + plotH);
    ctx.lineTo(x(0), pad.top + plotH);
    ctx.closePath();
    ctx.fillStyle = grad;
    ctx.fill();

    // Line
    ctx.beginPath();
    ctx.moveTo(x(0), y(vals[0]));
    for (let i = 1; i < vals.length; i++) ctx.lineTo(x(i), y(vals[i]));
    ctx.strokeStyle = "#c084fc";
    ctx.lineWidth = 2;
    ctx.lineJoin = "round";
    ctx.stroke();

    // Dots
    for (let i = 0; i < vals.length; i++) {
      ctx.beginPath();
      ctx.arc(x(i), y(vals[i]), 3.5, 0, Math.PI * 2);
      ctx.fillStyle = "#c084fc";
      ctx.fill();
      ctx.strokeStyle = "#1f2028";
      ctx.lineWidth = 2;
      ctx.stroke();
    }
  }, [data]);

  return (
    <canvas
      ref={canvasRef}
      className="dash-chart-canvas"
      style={{ width: "100%", height: "100%" }}
    />
  );
}

const DONUT_COLORS = ["#c084fc", "#6366f1", "#38bdf8", "#34d399", "#fbbf24", "#f87171"];

function DonutChart({ data }) {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || data.length === 0) return;
    const ctx = canvas.getContext("2d");
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);
    const size = Math.min(rect.width, rect.height);
    const cx = rect.width / 2;
    const cy = rect.height / 2;
    const R = size / 2 - 4;
    const inner = R * 0.58;

    const total = data.reduce((s, [, c]) => s + c, 0);
    let angle = -Math.PI / 2;

    ctx.clearRect(0, 0, rect.width, rect.height);

    for (let i = 0; i < data.length; i++) {
      const slice = (data[i][1] / total) * Math.PI * 2;
      ctx.beginPath();
      ctx.arc(cx, cy, R, angle, angle + slice);
      ctx.arc(cx, cy, inner, angle + slice, angle, true);
      ctx.closePath();
      ctx.fillStyle = DONUT_COLORS[i % DONUT_COLORS.length];
      ctx.fill();
      angle += slice;
    }
  }, [data]);

  return (
    <canvas
      ref={canvasRef}
      className="dash-chart-canvas"
      style={{ width: "100%", height: "100%" }}
    />
  );
}

// ─── Dashboard component ─────────────────────────────────────────────────────

export function Dashboard({ userId }) {
  const profile = useQuery(api.users.me);
  const sessions = useQuery(
    api.sessions.listByUser,
    userId && userId !== "anonymous" ? { user_id: userId, limit: 200 } : "skip",
  );
  const profileVersions = useQuery(
    api.profile_versions.listByUser,
    userId && userId !== "anonymous" ? { user_id: userId } : "skip",
  );

  const data = useAggregatedData(sessions, profile, profileVersions);

  if (!data) {
    return (
      <div className="dashboard dashboard--loading">
        <p className="dash-loading">Loading dashboard…</p>
      </div>
    );
  }

  const {
    sessionsThisWeek,
    weeklyAvg,
    topPhrases,
    maxPhraseCount,
    conditionBreakdown,
    streak,
    versionNumber,
    latestVersion,
  } = data;

  return (
    <div className="dashboard">
      <div className="dash-header">
        <h2 className="dash-title">Your progress</h2>
        <p className="dash-sub">
          {profile?.session_count ?? 0} total sessions · {profile?.good_session_count ?? 0} high-confidence
        </p>
      </div>

      <div className="dash-grid">
        {/* Intelligibility over time — spans full row */}
        <div className="dash-card dash-card--wide">
          <h3 className="dash-card-title">Intelligibility score</h3>
          <p className="dash-card-sub">Weekly average confidence</p>
          <div className="dash-chart-wrap dash-chart-wrap--line">
            {weeklyAvg.length > 1 ? (
              <LineChart data={weeklyAvg} />
            ) : (
              <p className="dash-chart-empty">Record more sessions to see trends</p>
            )}
          </div>
        </div>

        {/* Sessions this week */}
        <div className="dash-card">
          <h3 className="dash-card-title">This week</h3>
          <div className="dash-stat">
            <span className="dash-stat-number">{sessionsThisWeek}</span>
            <span className="dash-stat-label">sessions</span>
          </div>
        </div>

        {/* Streak */}
        <div className="dash-card">
          <h3 className="dash-card-title">Streak</h3>
          <div className="dash-stat">
            <span className="dash-stat-number">
              {streak > 0 ? `${streak}` : "0"}
            </span>
            <span className="dash-stat-label">
              {streak === 1 ? "day" : "days"} in a row
            </span>
          </div>
        </div>

        {/* Profile version */}
        <div className="dash-card">
          <h3 className="dash-card-title">Profile</h3>
          {versionNumber > 0 ? (
            <div className="dash-stat">
              <span className="dash-stat-number dash-stat-number--sm">v{versionNumber}</span>
              <span className="dash-stat-label">
                {latestVersion
                  ? `Updated ${relativeTime(latestVersion.created_at)}`
                  : "Personalised"}
              </span>
            </div>
          ) : (
            <div className="dash-stat">
              <span className="dash-stat-number dash-stat-number--sm">—</span>
              <span className="dash-stat-label">
                {10 - (profile?.good_session_count ?? 0)} more sessions until first update
              </span>
            </div>
          )}
        </div>

        {/* Condition breakdown */}
        <div className="dash-card">
          <h3 className="dash-card-title">Conditions used</h3>
          {conditionBreakdown.length > 0 ? (
            <div className="dash-condition-row">
              <div className="dash-donut-wrap">
                <DonutChart data={conditionBreakdown} />
              </div>
              <ul className="dash-condition-legend">
                {conditionBreakdown.map(([cond, count], i) => (
                  <li key={cond}>
                    <span
                      className="dash-legend-dot"
                      style={{ background: DONUT_COLORS[i % DONUT_COLORS.length] }}
                    />
                    <span className="dash-legend-label">{cond}</span>
                    <span className="dash-legend-count">{count}</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <p className="dash-chart-empty">No sessions yet</p>
          )}
        </div>

        {/* Top phrases — spans full row */}
        <div className="dash-card dash-card--wide">
          <h3 className="dash-card-title">Most used words</h3>
          <p className="dash-card-sub">From your corrected transcripts</p>
          {topPhrases.length > 0 ? (
            <ul className="dash-phrases">
              {topPhrases.map(([word, count]) => (
                <li key={word} className="dash-phrase-row">
                  <span className="dash-phrase-word">{word}</span>
                  <div className="dash-phrase-bar-track">
                    <div
                      className="dash-phrase-bar"
                      style={{ width: `${(count / maxPhraseCount) * 100}%` }}
                    />
                  </div>
                  <span className="dash-phrase-count">{count}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="dash-chart-empty">Record sessions to see your vocabulary</p>
          )}
        </div>
      </div>
    </div>
  );
}
