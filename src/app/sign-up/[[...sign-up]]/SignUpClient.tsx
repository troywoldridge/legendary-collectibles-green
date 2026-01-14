"use client";

import { SignUp } from "@clerk/nextjs";

export default function SignUpClient() {
  return (
    <SignUp
      routing="path"
      path="/sign-up"
      afterSignUpUrl="/post-auth"
      signInUrl="/sign-in"
    />
  );
}
