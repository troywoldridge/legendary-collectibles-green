"use client";

import { SignIn } from "@clerk/nextjs";

export const metadata = {
  robots: { index: false, follow: false },
};


export default function SignInClient() {
  return (
    <SignIn
      routing="path"
      path="/sign-in"
      afterSignInUrl="/post-auth"
      signUpUrl="/sign-up"
    />
  );
}
