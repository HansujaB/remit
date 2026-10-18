import { useEffect, useState, useMemo } from "react";
import { useAuth, useUser } from "@clerk/react";
import { LoaderCircle } from "lucide-react";
import { Button } from "./components/ui/button";
import { Logo } from "./components/brand";
import { Modal } from "./components/modal";
import { Landing } from "./components/landing";
import { ApiContext, createApi } from "./lib/api";
import { Workspace } from "./components/workspace";

function useRoute() {
  const [route, setRoute] = useState(() => location.hash.slice(1) || "/");
  useEffect(() => {
    const change = () => setRoute(location.hash.slice(1) || "/");
    addEventListener("hashchange", change);
    return () => removeEventListener("hashchange", change);
  }, []);
  return [
    route,
    (path) => {
      location.hash = path;
    },
  ];
}

export default function App({ authEnabled }) {
  return authEnabled ? <AuthenticatedApp /> : <AppGate authEnabled={false} />;
}

function AuthenticatedApp() {
  const { isLoaded, isSignedIn, userId, getToken } = useAuth();
  const { user } = useUser();
  const api = useMemo(() => createApi(getToken), [getToken]);
  if (!isLoaded)
    return (
      <div className="loading-page">
        <Logo />
        <LoaderCircle className="spin" />
        <p>Opening your workspace…</p>
      </div>
    );
  return (
    <AppGate
      authEnabled
      api={api}
      signedIn={isSignedIn}
      userId={userId}
      name={user?.firstName || "friend"}
    />
  );
}

function AppGate({
  authEnabled,
  signedIn = false,
  userId,
  name = "friend",
  api,
}) {
  const [route, navigate] = useRoute();
  const [missing, setMissing] = useState(false);
  useEffect(() => {
    if (signedIn && (route === "/" || route.startsWith("/sign") || route.startsWith("/demo"))) {
      location.hash = "/home";
    }
  }, [signedIn, route]);
  return (
    <>
      {signedIn ? (
        <ApiContext.Provider value={api}>
          <Workspace
            key={userId}
            userId={userId}
            name={name}
            route={route}
            navigate={navigate}
          />
        </ApiContext.Provider>
      ) : (
        <Landing
          authEnabled={authEnabled}
          onMissing={() => setMissing(true)}
        />
      )}{" "}
      {missing && (
        <Modal title="Sign in" onClose={() => setMissing(false)}>
          <div className="modal-body">
            <p>We couldn’t open sign-in. Please try again shortly.</p>
            <Button className="button primary" onClick={() => setMissing(false)}>Close</Button>
          </div>
        </Modal>
      )}
    </>
  );
}
