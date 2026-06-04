"use client";

import React, { useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation"; // Wait, in Next.js App Router, it's 'next/navigation'
import { Loader2 } from "lucide-react";

function AuthCallbackHandler() {
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    const token = searchParams.get("token");
    if (token) {
      localStorage.setItem("token", token);
      router.push("/");
    } else {
      router.push("/");
    }
  }, [searchParams, router]);

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-pg-bg bg-dot-grid p-6 text-pg-fg">
      <div className="bg-white border-4 border-pg-fg p-8 rounded-2xl shadow-hard text-center max-w-sm w-full">
        <Loader2 className="animate-spin text-pg-accent mx-auto mb-4" size={40} strokeWidth={3} />
        <h2 className="text-2xl font-heading font-black mb-2">Connecting Account...</h2>
        <p className="text-sm font-bold text-pg-fg/70">
          Securing your session and loading repository dashboard.
        </p>
      </div>
    </div>
  );
}

export default function AuthCallbackPage() {
  return (
    <Suspense fallback={
      <div className="flex flex-col items-center justify-center min-h-screen bg-pg-bg p-6 text-pg-fg">
        <div className="bg-white border-4 border-pg-fg p-8 rounded-2xl shadow-hard text-center">
          <Loader2 className="animate-spin text-pg-accent mx-auto mb-4" size={40} strokeWidth={3} />
          <h2 className="text-2xl font-heading font-black mb-2">Loading...</h2>
        </div>
      </div>
    }>
      <AuthCallbackHandler />
    </Suspense>
  );
}
