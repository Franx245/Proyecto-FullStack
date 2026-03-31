import { Suspense } from "react";

import TermsPage from "@/next/pages/TermsPage.jsx";

export default function TermsRoute() {
  return (
    <Suspense fallback={null}>
      <TermsPage />
    </Suspense>
  );
}