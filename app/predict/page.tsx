"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import WeekPager from "../WeekPager";
import { defaultWeekIndex, groupByWeek } from "../weekUtils";

interface MatchApi {
  id: string;
  home_team: string;
  away_team: string;
  kickoff_at: string;
  status: "scheduled" | "postponed" | "finished";
  home_score: number | null;
  away_score: number | null;
}

interface OwnPred {
  match_id: string;
  home_pred: number;
  away_pred: number;
  points: number | null;
}

export default function PredictPage() {
  const router = useRouter();
  const [matches, setMatches] = useState<MatchApi[]>([]);
  const [own, setOwn] = useState<Record<string, OwnPred>>({});
  const [pendingCounts, setPendingCounts] = useState<Record<string, number>>({});
  const [drafts, setDrafts] = useState<Record<string, { home: string; away: string }>>({});
  const [saving, setSaving] = useState<Record<string, boolean>>({});
  const [savedFlash, setSavedFlash] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);
  const [weekIndex, setWeekIndex] = useState<number | null>(null);

  async function loadAll() {
    const joinRes = await fetch("/api/join");
    const joinData = await joinRes.json();
    if (!joinData.player) {
      router.replace("/");
      return;
    }

    const [fixturesRes, predsRes] = await Promise.all([
      fetch("/api/fixtures"),
      fetch("/api/predictions"),
    ]);
    const fixturesData = await fixturesRes.json();
    const predsData = await predsRes.json();

    setMatches(fixturesData.matches || []);

    const ownMap: Record<string, OwnPred> = {};
    for (const p of predsData.own || []) ownMap[p.match_id] = p;
    setOwn(ownMap);
    setPendingCounts(predsData.pendingCounts || {});

    const nextDrafts: Record<string, { home: string; away: string }> = {};
    for (const p of predsData.own || []) {
      nextDrafts[p.match_id] = { home: String(p.home_pred), away: String(p.away_pred) };
    }
    setDrafts((prev) => ({ ...nextDrafts, ...prev }));

    setLoading(false);
  }

  useEffect(() => {
    loadAll();
  }, []);

  const grouped = useMemo(() => groupByWeek(matches, (m) => m.kickoff_at), [matches]);

  // Land on the current (or nearest upcoming) week the first time fixtures load,
  // but don't yank the user back there on every background refresh afterwards.
  useEffect(() => {
    if (weekIndex === null && grouped.length > 0) {
      setWeekIndex(defaultWeekIndex(grouped));
    }
  }, [grouped, weekIndex]);

  function updateDraft(matchId: string, field: "home" | "away", value: string) {
    const cleaned = value.replace(/[^0-9]/g, "").slice(0, 2);
    setDrafts((prev) => ({ ...prev, [matchId]: { ...(prev[matchId] || { home: "", away: "" }), [field]: cleaned } }));
  }

  async function save(matchId: string) {
    const draft = drafts[matchId];
    if (!draft || draft.home === "" || draft.away === "") return;
    setSaving((s) => ({ ...s, [matchId]: true }));
    try {
      const res = await fetch("/api/predictions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ matchId, homePred: Number(draft.home), awayPred: Number(draft.away) }),
      });
      if (res.ok) {
        setOwn((prev) => ({
          ...prev,
          [matchId]: { match_id: matchId, home_pred: Number(draft.home), away_pred: Number(draft.away), points: null },
        }));
        setSavedFlash((f) => ({ ...f, [matchId]: true }));
        setTimeout(() => setSavedFlash((f) => ({ ...f, [matchId]: false })), 1500);
      } else {
        const data = await res.json();
        alert(data.error || "Could not save prediction");
        loadAll();
      }
    } finally {
      setSaving((s) => ({ ...s, [matchId]: false }));
    }
  }

  if (loading || weekIndex === null) return <div className="empty-state">Loading fixtures…</div>;

  if (matches.length === 0) {
    return (
      <div className="empty-state">
        No fixtures yet. Once the league sync has run for the first time, matches will show up
        here.
      </div>
    );
  }

  const [weekKey, weekMatches] = grouped[weekIndex];

  return (
    <div>
      <WeekPager
        weekKey={weekKey}
        index={weekIndex}
        count={grouped.length}
        onPrev={() => setWeekIndex((i) => Math.max(0, (i ?? 0) - 1))}
        onNext={() => setWeekIndex((i) => Math.min(grouped.length - 1, (i ?? 0) + 1))}
      />
      <div className="card">
        {weekMatches.map((m) => {
          const started = new Date(m.kickoff_at).getTime() <= Date.now();
          const finished = m.status === "finished";
          const postponed = m.status === "postponed" && !started;
          const draft = drafts[m.id] || { home: "", away: "" };
          const myPoints = own[m.id]?.points;

          return (
            <div key={m.id} className="match-row" style={{ flexDirection: "column", alignItems: "stretch" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <div className="team">{m.home_team}</div>
                <div className="score-inputs">
                  {finished ? (
                    <>
                      <strong>{m.home_score}</strong>
                      <span>–</span>
                      <strong>{m.away_score}</strong>
                    </>
                  ) : (
                    <>
                      <input
                        inputMode="numeric"
                        disabled={started || postponed}
                        value={draft.home}
                        onChange={(e) => updateDraft(m.id, "home", e.target.value)}
                      />
                      <span>–</span>
                      <input
                        inputMode="numeric"
                        disabled={started || postponed}
                        value={draft.away}
                        onChange={(e) => updateDraft(m.id, "away", e.target.value)}
                      />
                    </>
                  )}
                </div>
                <div className="team away">{m.away_team}</div>
              </div>

              <div className="meta-row">
                <span>
                  {new Date(m.kickoff_at).toLocaleString(undefined, {
                    weekday: "short",
                    day: "numeric",
                    month: "short",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </span>
                {finished && <span className="badge finished">Full time</span>}
                {postponed && <span className="badge postponed">Postponed</span>}
                {!finished && !postponed && started && <span className="badge locked">Kicked off</span>}
                {!finished && !postponed && !started && <span className="badge open">Open</span>}
              </div>

              {!finished && !postponed && !started && (
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 8 }}>
                  <span style={{ fontSize: 12, color: "#94a3b8" }}>
                    {pendingCounts[m.id] ? `${pendingCounts[m.id]} friend(s) have predicted` : "No predictions yet"}
                  </span>
                  <button
                    className="primary"
                    style={{ width: "auto", padding: "8px 14px", fontSize: 13 }}
                    disabled={saving[m.id] || draft.home === "" || draft.away === ""}
                    onClick={() => save(m.id)}
                  >
                    {savedFlash[m.id] ? "Saved ✓" : saving[m.id] ? "Saving…" : "Save prediction"}
                  </button>
                </div>
              )}

              {(started || finished) && own[m.id] && (
                <div className="others-preds">
                  <span>
                    You: {own[m.id].home_pred}-{own[m.id].away_pred}
                    {typeof myPoints === "number" && (
                      <span className="points-pill" style={{ marginLeft: 6 }}>
                        +{myPoints} pt{myPoints === 1 ? "" : "s"}
                      </span>
                    )}
                  </span>
                  <span style={{ marginLeft: 10 }}>
                    Check the <strong>Friends</strong> tab to see how everyone else did.
                  </span>
                </div>
              )}

              {(started || finished) && !own[m.id] && (
                <div className="others-preds">
                  <span>You didn&rsquo;t predict this one.</span>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
