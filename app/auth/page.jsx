import { Suspense } from "react";

import AuthPage from "@/next/pages/AuthPage.jsx";

export default function AuthRoute() {
  return (
    <Suspense fallback={null}>
      <AuthPage />
    </Suspense>
  );
}