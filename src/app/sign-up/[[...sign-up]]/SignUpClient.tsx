"use client";

import { SignUp } from "@clerk/nextjs";

export const metadata = {
  robots: { index: false, follow: false },
};


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
