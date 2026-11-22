import { registerAnyrouter } from "./src/register.mjs"

/** Official AnyRouter provider for the pi coding agent. */
export default function (pi) {
  registerAnyrouter(pi)
}
