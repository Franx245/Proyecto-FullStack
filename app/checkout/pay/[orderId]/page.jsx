import { Suspense } from "react";

import OrderPaymentPage from "@/next/pages/OrderPaymentPage.jsx";

/** @param {{ params: { orderId: string } }} props */
export default function CheckoutPayRoute({ params }) {
  return (
    <Suspense fallback={null}>
      <OrderPaymentPage orderId={params.orderId} />
    </Suspense>
  );
}