import { Suspense } from "react";

import CheckoutResultPage from "@/next/pages/CheckoutResultPage.jsx";

/** @param {{ searchParams: Record<string, string> }} props */
export default function CheckoutFailureRoute({ searchParams }) {
  return (
    <Suspense fallback={null}>
      <CheckoutResultPage statusKey="failure" orderId={searchParams.orderId} />
    </Suspense>
  );
}