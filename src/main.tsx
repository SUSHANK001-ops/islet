import { render } from "preact";
import "./ui/tokens.css";
import "./app/shell.css";
import { Shell } from "./app/shell";

const root = document.getElementById("root");
if (root) {
  render(<Shell />, root);
}
