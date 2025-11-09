// src/app/sign-up/[[...sign-up]]/page.tsx
"use client";
import { SignUp } from "@clerk/nextjs";

export default function Page() {
  return (
    <div className="mx-auto max-w-md py-12">
      <SignUp
        routing="path"
        path="/sign-up"           // must match your route segment
        afterSignUpUrl="/post-auth"
        signInUrl="/sign-in"
      />
    </div>
  );
}
