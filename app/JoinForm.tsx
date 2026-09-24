"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

export default function JoinForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const recoveryToken = searchParams.get("t");

  const [checking, setChecking] = useState(true);
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [recoveryUrl, setRecoveryUrl] = useState<string | null>(null);
  const [joinedName, setJoinedName] = useState<string | null>(null);

  useEffect(() => {
    async function boot() {
      if (recoveryToken) {
        const res = await fetch("/api/join/adopt", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token: recoveryToken }),
        });
        if (res.ok) {
          router.replace("/predict");
          return;
        }
        setError("That link isn't valid any more - enter your name below to join fresh.");
        setChecking(false);
        return;
      }

      const res = await fetch("/api/join");
      const data = await res.json();
      if (data.player) {
        router.replace("/predict");
        return;
      }
      setChecking(false);
    }
    boot();
  }, [recoveryToken, router]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const res = await fetch("/api/join", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Something went wrong.");
        return;
      }
      setJoinedName(data.player.name);
      setRecoveryUrl(`${window.location.origin}/?t=${data.player.token}`);
    } finally {
      setSubmitting(false);
    }
  }

  if (checking) return null;

  if (joinedName && recoveryUrl) {
    return (
      <div className="card">
        <h2>You&rsquo;re in, {joinedName}! ⚽</h2>
        <p>
          One thing before you go - save this private link. It&rsquo;s the only way to get back
          in as <strong>{joinedName}</strong> on another phone or browser (there are no
          passwords).
        </p>
        <div className="recovery-box">{recoveryUrl}</div>
        <div style={{ marginTop: 16 }}>
          <button className="primary" onClick={() => (window.location.href = "/predict")}>
            Start predicting
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="card">
      <h2>Join the league</h2>
      <p>Pick a name your friends will recognise, then start predicting scores.</p>
      <form onSubmit={handleSubmit}>
        <input
          className="name-input"
          placeholder="Your name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={40}
          autoFocus
        />
        {error && <div className="error-text">{error}</div>}
        <button className="primary" type="submit" disabled={submitting || name.trim().length < 2}>
          {submitting ? "Joining..." : "Join"}
        </button>
      </form>
    </div>
  );
}
