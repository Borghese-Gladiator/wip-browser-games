import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "@portal/shared/theme.css";
import "./poker.css";
import { Poker } from "./Poker.jsx";

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <Poker />
  </StrictMode>,
);
