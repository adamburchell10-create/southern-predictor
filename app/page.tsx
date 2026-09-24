import { Suspense } from "react";
import JoinForm from "./JoinForm";

export default function HomePage() {
  return (
    <Suspense fallback={null}>
      <JoinForm />
    </Suspense>
  );
}
