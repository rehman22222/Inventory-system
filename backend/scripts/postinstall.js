// Runs automatically after `npm install` in the backend.
//
// On Hostinger the deploy only does two things: `npm install` and then run the
// entry file (`server.js`). There is no separate build step, so this is where we
// build the React frontend — the Express server then serves that build (see the
// static-file block in server.js).
//
// Skips cleanly when:
//   - SKIP_CLIENT_BUILD is set (quick local backend installs), or
//   - ../frontend isn't present (backend deployed on its own → API-only).
const { execSync } = require("child_process");
const fs = require("fs");
const path = require("path");

if (process.env.SKIP_CLIENT_BUILD) {
  console.log("[postinstall] SKIP_CLIENT_BUILD set — skipping frontend build");
  process.exit(0);
}

const frontendDir = path.join(__dirname, "..", "..", "frontend");
if (!fs.existsSync(path.join(frontendDir, "package.json"))) {
  console.log("[postinstall] ../frontend not found — skipping frontend build (API-only)");
  process.exit(0);
}

// Build the frontend INTO the backend (backend/client) rather than
// frontend/build. Hostinger deploys only the "root directory" (backend) to the
// runtime, so the built app has to live inside backend to travel with it — a
// sibling frontend/build gets left behind and the server can't find it.
const clientOut = path.resolve(__dirname, "..", "client");

try {
  console.log(`[postinstall] installing + building frontend → ${clientOut} …`);
  execSync("npm install && npm run build", {
    cwd: frontendDir,
    env: { ...process.env, BUILD_PATH: clientOut },
    stdio: "inherit",
  });
  console.log("[postinstall] frontend build complete");
} catch (error) {
  console.error("[postinstall] frontend build failed:", error.message);
  process.exit(1);
}
