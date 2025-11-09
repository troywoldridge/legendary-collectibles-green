// src/app/sign-in/[[...sign-in]]/page.tsx
import { SignIn } from "@clerk/nextjs";

export default function Page() {
  return (
    <div className="mx-auto max-w-md py-12">
      <SignIn
        routing="path"
        path="/sign-in"          // ← required when routing="path"
        afterSignInUrl="/post-auth"
        signUpUrl="/sign-up"
      />
    </div>
  );
}
