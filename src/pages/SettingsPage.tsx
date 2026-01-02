import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getUserPreferences, setDisplayName } from "../lib/api";

const SettingsPage = () => {
  const queryClient = useQueryClient();
  const { data: prefs } = useQuery({ queryKey: ["userPreferences"], queryFn: getUserPreferences });
  const [displayName, setDisplayNameInput] = useState("");

  useEffect(() => {
    if (prefs?.display_name !== undefined && prefs.display_name !== null) {
      setDisplayNameInput(prefs.display_name);
    }
  }, [prefs]);

  const saveMutation = useMutation({
    mutationFn: (name: string) => setDisplayName(name),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["userPreferences"] });
      alert("Saved display name.");
    },
    onError: () => alert("Failed to save display name.")
  });

  return (
    <div className="page-grid">
      <section className="card">
        <header className="card-header">
          <p className="eyebrow">Profile</p>
          <h2>Settings</h2>
          <p className="muted small">Set a display name to show on shared lists.</p>
        </header>
        <div className="form-grid">
          <label className="field">
            <span>Display name</span>
            <input
              className="input"
              value={displayName}
              onChange={(e) => setDisplayNameInput(e.target.value)}
              placeholder="Your name"
            />
          </label>
        </div>
        <div className="pill-row" style={{ marginTop: 12 }}>
          <button
            className="button"
            onClick={() => {
              if (!displayName.trim()) {
                alert("Please enter a name.");
                return;
              }
              saveMutation.mutate(displayName.trim());
            }}
            disabled={saveMutation.isPending}
          >
            Save
          </button>
        </div>
      </section>
    </div>
  );
};

export default SettingsPage;
