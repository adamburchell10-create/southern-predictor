"use client";

import { useEffect, useState } from "react";
import WeekPager from "../WeekPager";

interface Standing {
  playerId: string;
  name: string;
  played: number;
  exact: number;
  close: number;
  result: number;
  bonus: number;
  total: number;
}

interface Gameweek {
  key: string;
  label: string;
  kind: "weekend" | "midweek";
  fixtureCount: number;
  finishedCount: number;
  standings: Standing[];
}

export default function WeeklyPage() {
  const [gameweeks, setGameweeks] = useState<Gameweek[] | null>(null);
  const [me, setMe] = useState<string | null>(null);
  const [weekIndex, setWeekIndex] = useState<number | null>(null);

  useEffect(() => {
    async function load() {
      const [weeklyRes, meRes] = await Promise.all([fetch("/api/weekly"), fetch("/api/join")]);
      const weeklyData = await weeklyRes.json();
      const meData = await meRes.json();
      setGameweeks(weeklyData.gameweeks || []);
      setMe(meData.player?.id ?? null);
    }
    load();
  }, []);

  useEffect(() => {
    if (weekIndex !== null || !gameweeks || gameweeks.length === 0) return;
    // Default to the most recently played round - the latest one with at
    // least one finished match - falling back to the last round overall if
    // nothing has kicked off yet.
    let idx = gameweeks.length - 1;
    for (let i = gameweeks.length - 1; i >= 0; i--) {
      if (gameweeks[i].finishedCount > 0) {
        idx = i;
        break;
      }
    }
    setWeekIndex(idx);
  }, [gameweeks, weekIndex]);

  if (!gameweeks) return <div className="empty-state">Loading weekly standings…</div>;

  if (gameweeks.length === 0) {
    return <div className="empty-state">No gameweeks yet - check back once fixtures are in.</div>;
  }

  const idx = weekIndex ?? gameweeks.length - 1;
  const current = gameweeks[idx];
  const rows = [...current.standings].sort(
    (a, b) => b.total - a.total || b.exact - a.exact || b.close - a.close
  );

  return (
    <div>
      <WeekPager
        label={current.label}
        kind={current.kind}
        isCurrent={false}
        index={idx}
        count={gameweeks.length}
        onPrev={() => setWeekIndex(Math.max(0, idx - 1))}
        onNext={() => setWeekIndex(Math.min(gameweeks.length - 1, idx + 1))}
      />
      <div className="card">
        <h2 style={{ marginTop: 0 }}>
          {current.kind === "weekend" ? "Weekend standings" : "Midweek standings"}
        </h2>
        <p style={{ color: "#94a3b8", fontSize: 13, marginTop: -6 }}>
          Just this round&rsquo;s points - 3 pts exact, 1.5 pts close, 1 pt correct result, plus
          this round&rsquo;s own gameweek bonus (5-7 correct = +1, 8-9 = +2, 10+ = +3).{" "}
          {current.finishedCount}/{current.fixtureCount} fixtures played.
        </p>
        {rows.length === 0 ? (
          <div className="empty-state">Nobody&rsquo;s predicted this round yet.</div>
        ) : (
          <div className="table-scroll">
            <table className="leaderboard">
              <thead>
                <tr>
                  <th></th>
                  <th>Player</th>
                  <th>Pts</th>
                  <th>Exact</th>
                  <th>Close</th>
                  <th>Result</th>
                  <th>Bonus</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={r.playerId} className={r.playerId === me ? "me" : ""}>
                    <td className="rank">{i + 1}</td>
                    <td>{r.name}</td>
                    <td>
                      <strong>{r.total}</strong>
                    </td>
                    <td>{r.exact}</td>
                    <td>{r.close}</td>
                    <td>{r.result}</td>
                    <td>{r.bonus > 0 ? `+${r.bonus}` : 0}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
