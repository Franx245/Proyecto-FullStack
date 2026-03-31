import { Suspense } from "react";

import CheckoutResultPage from "@/next/pages/CheckoutResultPage.jsx";

/** @param {{ searchParams: Record<string, string> }} props */
export default function CheckoutPendingRoute({ searchParams }) {
  return (
    <Suspense fallback={null}>
      <CheckoutResultPage statusKey="pending" orderId={searchParams.orderId} />
    </Suspense>
  );
}