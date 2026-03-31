import { Suspense } from "react";

import ContactPage from "@/next/pages/ContactPage.jsx";

export default function ContactRoute() {
  return (
    <Suspense fallback={null}>
      <ContactPage />
    </Suspense>
  );
}