import "server-only";

import { setAdminToken, clearAdminToken } from "../actions";

export default function AdminGate({
  err,
}: {
  err?: string | null;
}) {
  return (
    <div className="adminGate">
      <h1 className="adminGate__title">Admin Access</h1>

      <p className="adminGate__muted">
        This admin area is protected. Enter the <b>ADMIN_UI_TOKEN</b> to continue.
      </p>

      {err ? (
        <div className="adminGate__msg adminGate__msg--error">
          Wrong token. Try again.
        </div>
      ) : null}

      <form className="adminGate__panel" action={setAdminToken}>
        <label className="adminGate__label">
          <span className="adminGate__labelText">Admin UI Token</span>
          <input
            className="adminGate__input"
            name="token"
            type="password"
            placeholder="Paste token here…"
            autoComplete="off"
            spellCheck={false}
            required
          />
        </label>

        <div className="adminGate__actions">
          <button className="adminGate__btn adminGate__btn--primary" type="submit">
            Enter Admin
          </button>

          {/* optional: a way to clear cookie */}
          <button className="adminGate__btn adminGate__btn--danger" formAction={clearAdminToken} type="submit">
            Clear Token
          </button>
        </div>

        <details className="adminGate__details">
          <summary className="adminGate__summary">Where do I get the token?</summary>
          <div className="adminGate__help">
            <div>Generate one:</div>
            <pre className="adminGate__code">
              {`node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`}
            </pre>
            <div>Put it in your production env:</div>
            <pre className="adminGate__code">{`ADMIN_UI_TOKEN=PASTE_TOKEN_HERE`}</pre>
            <div>Redeploy, then paste it above.</div>
          </div>
        </details>
      </form>
    </div>
  );
}
