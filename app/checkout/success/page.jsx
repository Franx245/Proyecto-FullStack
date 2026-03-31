import { Suspense } from "react";

import CheckoutResultPage from "@/next/pages/CheckoutResultPage.jsx";

/** @param {{ searchParams: Record<string, string> }} props */
export default function CheckoutSuccessRoute({ searchParams }) {
  return (
    <Suspense fallback={null}>
      <CheckoutResultPage statusKey="success" orderId={searchParams.orderId} />
    </Suspense>
  );
}