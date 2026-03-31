import { Suspense } from "react";

import OrderPaymentPage from "@/next/pages/OrderPaymentPage.jsx";

export default function CheckoutPayRoute({ params }) {
  return (
    <Suspense fallback={null}>
      <OrderPaymentPage orderId={params.orderId} />
    </Suspense>
  );
}