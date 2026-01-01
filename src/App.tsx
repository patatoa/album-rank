import { Link, Navigate, Route, Routes, useLocation } from "react-router-dom";
import { ReactNode } from "react";
import AddPage from "./pages/AddPage";
import RankingPage from "./pages/RankingPage";
import AlbumPage from "./pages/AlbumPage";
import SignInPage from "./pages/SignInPage";
import RankingLandingPage from "./pages/RankingLandingPage";
import PublicRankingPage from "./pages/PublicRankingPage";
import SettingsPage from "./pages/SettingsPage";
import { useAuth } from "./lib/AuthProvider";
import { useTheme } from "./lib/theme";
import InfoBubble from "./components/InfoBubble";

const Nav = () => {
  const location = useLocation();
  const active = (path: string) => (location.pathname.startsWith(path) ? "nav-link active" : "nav-link");

  return (
    <nav className="nav">
      <Link to="/add" className={active("/add")}>
        Add
      </Link>
      <Link to="/rankings" className={active("/rankings")}>
        Lists
      </Link>
      <Link to="/settings" className={active("/settings")}>
        Settings
      </Link>
    </nav>
  );
};

const Layout = ({ children }: { children: ReactNode }) => {
  const { signOut, user } = useAuth();
  const { theme, toggleTheme } = useTheme();
  return (
    <div className="page">
      <header className="topbar">
        <div className="logo">[ album-rank ]</div>
        <div className="nav-group">
          <Nav />
          <button className="button ghost" onClick={toggleTheme} aria-label="Toggle theme">
            {theme === "light" ? "☀" : "☾"}
          </button>
          {user && (
            <button className="button ghost" onClick={() => signOut()}>
              Sign out
            </button>
          )}
        </div>
      </header>
      <InfoBubble />
      {children}
    </div>
  );
};

function App() {
  const { session, loading } = useAuth();

  if (loading) {
    return <div className="page"><div className="card">Loading session…</div></div>;
  }

  // Allow public share page without auth
  if (!session) {
    return (
      <Routes>
        <Route path="/share/:slug" element={<PublicRankingPage />} />
        <Route path="*" element={<SignInPage />} />
      </Routes>
    );
  }

  return (
    <Layout>
      <Routes>
        <Route path="/" element={<Navigate to="/rankings" replace />} />
        <Route path="/add" element={<AddPage />} />
        <Route path="/rankings/:rankingListId" element={<RankingPage />} />
        <Route path="/rankings" element={<RankingLandingPage />} />
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="/albums/:albumId" element={<AlbumPage />} />
        <Route path="/share/:slug" element={<PublicRankingPage />} />
        <Route path="*" element={<Navigate to="/add" replace />} />
      </Routes>
    </Layout>
  );
}

export default App;
