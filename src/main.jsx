import React from "react";
import { createRoot } from "react-dom/client";
import { ClerkProvider } from "@clerk/react";
import App from "./App.jsx";
import "./styles.css";

const publishableKey = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY?.trim();
const app = <App authEnabled={Boolean(publishableKey)} />;
createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    {publishableKey ? (
      <ClerkProvider
        publishableKey={publishableKey}
        afterSignOutUrl="/"
        signInForceRedirectUrl="/#/home"
        signUpForceRedirectUrl="/#/home"
        appearance={{
          variables: {
            colorPrimary: "#252521",
            colorText: "#252521",
            colorBackground: "#fbfaf7",
            borderRadius: "12px",
            fontFamily: "Arial, sans-serif",
          },
        }}
      >
        {app}
      </ClerkProvider>
    ) : (
      app
    )}
  </React.StrictMode>,
);
