import { Suspense } from "react";

import CheckoutResultPage from "@/next/pages/CheckoutResultPage.jsx";

export default function CheckoutFailureRoute({ searchParams }) {
  return (
    <Suspense fallback={null}>
      <CheckoutResultPage statusKey="failure" orderId={searchParams.orderId} />
    </Suspense>
  );
}