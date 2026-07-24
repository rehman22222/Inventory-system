// Hostinger may restore npm binaries without their executable permission.
// Calling Vite through its JavaScript API avoids relying on node_modules/.bin.
import { createBuilder } from "vite";

const builder = await createBuilder();
await builder.buildApp();
