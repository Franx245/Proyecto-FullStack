import { Suspense } from "react";

import AccountPage from "@/next/pages/AccountPage.jsx";

export default function Account() {
  return (
    <Suspense fallback={null}>
      <AccountPage />
    </Suspense>
  );
}