import { useLocation } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { dismissIntroBubble, getUserPreferences } from "../lib/api";

const InfoBubble = () => {
  const location = useLocation();
  const queryClient = useQueryClient();

  const { data: prefs, isLoading } = useQuery({
    queryKey: ["userPreferences"],
    queryFn: getUserPreferences
  });

  const dismissMutation = useMutation({
    mutationFn: dismissIntroBubble,
    onSuccess: () => {
      queryClient.setQueryData(["userPreferences"], (prev) => ({
        ...(prev as any),
        intro_dismissed: true
      }));
    }
  });

  const dismissed = prefs?.intro_dismissed ?? false;
  const shouldShow =
    !isLoading &&
    !dismissed &&
    (location.pathname.startsWith("/add") || location.pathname.startsWith("/rankings"));

  if (!shouldShow) return null;

  return (
    <div className="info-bubble">
      <button
        className="bubble-close"
        aria-label="Dismiss"
        onClick={() => dismissMutation.mutate()}
        disabled={dismissMutation.isPending}
      >
        ×
      </button>
      <p className="eyebrow">What this is?</p>
      <p>
        Add an album you’re listening to, then browse everything in a year (or any list) as a big grid. Click an album to
        update its status and jot a quick note if you want. When you want to organize your favorites, you can either
        drag-and-drop albums into rank order or use a quick “this-or-that” mode to sort them out. It’s a simple way to
        track what you listened to and build a year-end list as you go.
      </p>
    </div>
  );
};

export default InfoBubble;
