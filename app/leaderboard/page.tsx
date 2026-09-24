"use client";

import { useEffect, useState } from "react";

interface Row {
  playerId: string;
  name: string;
  totalPoints: number;
  exact: number;
  close: number;
  correct: number;
  played: number;
}

export default function LeaderboardPage() {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [me, setMe] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      const [lbRes, meRes] = await Promise.all([fetch("/api/leaderboard"), fetch("/api/join")]);
      const lbData = await lbRes.json();
      const meData = await meRes.json();
      setRows(lbData.leaderboard || []);
      setMe(meData.player?.id ?? null);
    }
    load();
  }, []);

  if (!rows) return <div className="empty-state">Loading leaderboard…</div>;

  if (rows.length === 0) {
    return <div className="empty-state">No one has joined yet.</div>;
  }

  return (
    <div className="card">
      <h2 style={{ marginTop: 0 }}>Leaderboard</h2>
      <p style={{ color: "#94a3b8", fontSize: 13, marginTop: -6 }}>
        3 pts exact score · 1.5 pts correct result + goal difference · 1 pt correct result only
      </p>
      <table className="leaderboard">
        <thead>
          <tr>
            <th></th>
            <th>Player</th>
            <th>Pts</th>
            <th>Exact</th>
            <th>Close</th>
            <th>Correct</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={r.playerId} className={r.playerId === me ? "me" : ""}>
              <td className="rank">{i + 1}</td>
              <td>{r.name}</td>
              <td>
                <strong>{r.totalPoints}</strong>
              </td>
              <td>{r.exact}</td>
              <td>{r.close}</td>
              <td>{r.correct}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
