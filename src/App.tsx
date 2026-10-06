import { createRouter } from "@solidjs/router";
import { fileRoutes } from "@solidjs/router/fs";
import { pageRoutes } from "virtual:file-routes";
import { InstallHint } from "~/components/install-hint";
import { registerServiceWorker } from "~/lib/pwa";
import "./app.css";

const Router = createRouter({ routes: fileRoutes(pageRoutes) });

/** The application root: a single router driven by the file-based routes. */
export default function App() {
  registerServiceWorker();
  return (
    <>
      <Router>{(props) => props.children}</Router>
      <InstallHint />
    </>
  );
}
