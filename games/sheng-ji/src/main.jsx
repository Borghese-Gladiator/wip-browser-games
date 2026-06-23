import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "@portal/shared/theme.css";
import "./sheng-ji.css";
import { ShengJi } from "./ShengJi.jsx";

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <ShengJi />
  </StrictMode>,
);
