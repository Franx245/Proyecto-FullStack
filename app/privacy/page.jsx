import { Suspense } from "react";

import PrivacyPage from "@/next/pages/PrivacyPage.jsx";

export default function PrivacyRoute() {
  return (
    <Suspense fallback={null}>
      <PrivacyPage />
    </Suspense>
  );
}