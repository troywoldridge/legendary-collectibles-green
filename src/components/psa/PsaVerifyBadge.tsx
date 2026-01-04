"use client";

import * as React from "react";

type Props = {
  itemId: string;
  grading_company?: string | null;
  grade_label?: string | null;
  cert_number?: string | null;
  is_verified?: boolean | null;
  verified_at?: string | null;

  // Optional: let parent refresh the list / row after verification
  onVerified?: () => void;
};

function upper(x: unknown) {
  return String(x ?? "").trim().toUpperCase();
}

export default function PsaVerifyBadge(props: Props) {
  const grader = upper(props.grading_company);
  const grade = String(props.grade_label ?? "").trim();
  const cert = String(props.cert_number ?? "").trim();

  const isPsa = grader === "PSA";

  const [loading, setLoading] = React.useState(false);
  const [verified, setVerified] = React.useState(!!props.is_verified);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    setVerified(!!props.is_verified);
  }, [props.is_verified]);

  if (!isPsa) return null;

  const canVerify = !!cert && !verified;

  async function verify() {
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/psa/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ itemId: props.itemId }),
      });

      const json = await res.json().catch(() => null);

      if (!res.ok || !json?.ok) {
        throw new Error(json?.error || "Verification failed");
      }

      if (!json?.verified) {
        // PSA responded but didn’t validate the cert
        setVerified(false);
        setError(json?.psa?.serverMessage || "PSA could not verify this cert.");
      } else {
        setVerified(true);
        props.onVerified?.();
      }
    } catch (e: any) {
      setError(e?.message || "Verification failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="psaWrap">
      <div className="psaBadges">
        <span className="psaBadge">
          PSA{grade ? ` ${grade}` : ""}
        </span>

        {cert ? (
          <span className="psaCert">Cert {cert}</span>
        ) : (
          <span className="psaCert psaCertMissing">No cert #</span>
        )}

        {verified ? (
          <span className="psaStatus psaStatusOk">Verified</span>
        ) : (
          <span className="psaStatus psaStatusNo">Not verified</span>
        )}
      </div>

      <div className="psaActions">
        {canVerify ? (
          <button
            type="button"
            className="psaBtn"
            onClick={verify}
            disabled={loading}
          >
            {loading ? "Verifying..." : "Verify with PSA"}
          </button>
        ) : null}

        {error ? <div className="psaError">{error}</div> : null}
      </div>
    </div>
  );
}
