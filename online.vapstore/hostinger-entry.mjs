// Hostinger's "Other" preset installs dependencies and then launches a
// repository entry file. The postinstall script builds the TanStack/Nitro
// server into .output; this stable top-level entry then starts that build.
try {
  await import("./.output/server/index.mjs");
} catch (error) {
  console.error("Unable to start the storefront server build.", error);
  throw error;
}
