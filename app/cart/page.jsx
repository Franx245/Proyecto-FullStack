import { Suspense } from "react";
import dynamic from "next/dynamic";

const CartPage = dynamic(() => import("@/next/pages/CartPage.jsx"), { ssr: false });

export default function CartRoute() {
  return (
    <Suspense fallback={null}>
      <CartPage />
    </Suspense>
  );
}