import { createRouter } from "@solidjs/router";
import { fileRoutes } from "@solidjs/router/fs";
import { pageRoutes } from "virtual:file-routes";
import "./app.css";

const Router = createRouter({ routes: fileRoutes(pageRoutes) });

/** The application root: a single router driven by the file-based routes. */
export default function App() {
  return <Router>{(props) => props.children}</Router>;
}
