import { useState } from "react";
import { useAuth } from "../lib/AuthProvider";

const SignInPage = () => {
  const { signInWithGoogle } = useAuth();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleGoogle = async () => {
    setLoading(true);
    setError(null);
    try {
      await signInWithGoogle();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to sign in");
      setLoading(false);
    }
  };

  return (
    <div className="auth-shell">
      <div className="card auth-card">
        <h1>Sign in</h1>
        <p className="muted">Sign in using Google to rank albums!</p>
        {error && <div className="error">{error}</div>}
        <button
          className="button primary"
          onClick={handleGoogle}
          disabled={loading}
        >
          {loading ? "Redirecting…" : "Continue with Google"}
        </button>
      </div>
    </div>
  );
};

export default SignInPage;
