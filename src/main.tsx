import { render } from "preact";
import "./ui/tokens.css";
import "./app/shell.css";
import "./system/system.css";
import { Shell } from "./app/shell";
import { initSettings } from "./app/settings-store";

// Load persisted settings before first paint of the shell content. The pill
// itself shows immediately; the panel reads settings once they are in.
void initSettings();

const root = document.getElementById("root");
if (root) {
  render(<Shell />, root);
}
