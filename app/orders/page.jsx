import { Suspense } from "react";

import OrdersPage from "@/next/pages/OrdersPage.jsx";

export default function OrdersRoute() {
  return (
    <Suspense fallback={null}>
      <OrdersPage />
    </Suspense>
  );
}