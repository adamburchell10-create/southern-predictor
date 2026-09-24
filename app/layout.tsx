import "./globals.css";
import type { ReactNode } from "react";
import NavBar from "./NavBar";

export const metadata = {
  title: process.env.LEAGUE_NAME || "Southern League Predictor",
  description: "Predict the scores, play against your mates.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <NavBar />
        <div className="wrap">{children}</div>
      </body>
    </html>
  );
}
