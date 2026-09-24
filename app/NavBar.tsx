"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export default function NavBar() {
  const pathname = usePathname();
  const isActive = (href: string) => (pathname === href ? "active" : "");

  return (
    <div className="topbar">
      <div className="brand">
        Predictor
        <small>Southern League - Division One Central</small>
      </div>
      <nav className="nav">
        <Link href="/predict" className={isActive("/predict")}>
          Predict
        </Link>
        <Link href="/leaderboard" className={isActive("/leaderboard")}>
          Leaderboard
        </Link>
      </nav>
    </div>
  );
}
