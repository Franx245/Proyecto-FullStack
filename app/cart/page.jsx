import { Suspense } from "react";

import CartPage from "@/next/pages/CartPage.jsx";

export default function CartRoute() {
  return (
    <Suspense fallback={null}>
      <CartPage />
    </Suspense>
  );
}