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

interface PredEntry {
  match_id: string;
  home_pred: number;
  away_pred: number;
  points: number | null;
  name: string;
  isMe: boolean;
}

export default function FriendsPage() {
  const router = useRouter();
  const [matches, setMatches] = useState<MatchApi[]>([]);
  const [predsByMatch, setPredsByMatch] = useState<Record<string, PredEntry[]>>({});
  const [loading, setLoading] = useState(true);
  const [weekIndex, setWeekIndex] = useState<number | null>(null);

  useEffect(() => {
    async function load() {
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

      const byMatch: Record<string, PredEntry[]> = {};
      for (const p of predsData.own || []) {
        if (!byMatch[p.match_id]) byMatch[p.match_id] = [];
        byMatch[p.match_id].push({ ...p, name: joinData.player.name, isMe: true });
      }
      for (const p of predsData.others || []) {
        if (!byMatch[p.match_id]) byMatch[p.match_id] = [];
        byMatch[p.match_id].push({ ...p, name: p.player?.name ?? "Unknown", isMe: false });
      }
      for (const key of Object.keys(byMatch)) {
        byMatch[key].sort((a, b) => (b.points ?? -1) - (a.points ?? -1) || a.name.localeCompare(b.name));
      }
      setPredsByMatch(byMatch);
      setLoading(false);
    }
    load();
  }, [router]);

  const startedMatches = useMemo(() => {
    const now = Date.now();
    return matches.filter((m) => new Date(m.kickoff_at).getTime() <= now);
  }, [matches]);

  const grouped = useMemo(() => groupByWeek(startedMatches, (m) => m.kickoff_at), [startedMatches]);

  useEffect(() => {
    if (weekIndex === null && grouped.length > 0) {
      setWeekIndex(grouped.length - 1); // most recent week of revealed matches
    }
  }, [grouped, weekIndex]);

  if (loading) return <div className="empty-state">Loading…</div>;

  if (grouped.length === 0) {
    return (
      <div className="empty-state">
        No matches have kicked off yet - once one does, everyone&rsquo;s predictions for it will
        show up here.
      </div>
    );
  }

  const idx = weekIndex ?? grouped.length - 1;
  const [weekKey, weekMatches] = grouped[idx];

  return (
    <div>
      <WeekPager
        weekKey={weekKey}
        index={idx}
        count={grouped.length}
        onPrev={() => setWeekIndex(Math.max(0, idx - 1))}
        onNext={() => setWeekIndex(Math.min(grouped.length - 1, idx + 1))}
      />
      {weekMatches.map((m) => {
        const preds = predsByMatch[m.id] || [];
        const finished = m.status === "finished";
        return (
          <div key={m.id} className="card">
            <div className="friend-match-header">
              <span>{m.home_team}</span>
              {finished ? (
                <span>
                  {m.home_score} – {m.away_score}
                </span>
              ) : (
                <span style={{ color: "#94a3b8", fontSize: 13 }}>vs</span>
              )}
              <span>{m.away_team}</span>
            </div>
            <div className="meta-row" style={{ justifyContent: "center" }}>
              <span>
                {new Date(m.kickoff_at).toLocaleString(undefined, {
                  weekday: "short",
                  day: "numeric",
                  month: "short",
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </span>
              {finished ? (
                <span className="badge finished" style={{ marginLeft: 8 }}>
                  Full time
                </span>
              ) : (
                <span className="badge locked" style={{ marginLeft: 8 }}>
                  In progress
                </span>
              )}
            </div>

            {preds.length === 0 ? (
              <div className="empty-state" style={{ padding: "16px 0" }}>
                Nobody predicted this one.
              </div>
            ) : (
              <div className="friend-pred-list">
                {preds.map((p) => (
                  <div key={p.name} className={`friend-pred-row ${p.isMe ? "me" : ""}`}>
                    <span>{p.isMe ? `${p.name} (you)` : p.name}</span>
                    <span>
                      <span className="friend-pred-score">
                        {p.home_pred}-{p.away_pred}
                      </span>
                      {typeof p.points === "number" && (
                        <span className="points-pill" style={{ marginLeft: 8 }}>
                          +{p.points}
                        </span>
                      )}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
