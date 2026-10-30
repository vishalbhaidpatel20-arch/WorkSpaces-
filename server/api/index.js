/**
 * Vercel serverless entry point.
 *
 * Vercel owns the HTTP server, so this module only has to hand it the Express
 * app. Importing `../src/index.js` builds the app and, because IS_SERVERLESS
 * is true there, skips listen(), Socket.IO and the telemetry interval - none
 * of which a serverless runtime supports.
 *
 * Caveats of running here, stated plainly:
 *   - The database lives in /tmp, which is per-instance and discarded when the
 *     instance is recycled. Writes survive while an instance stays warm and are
 *     lost when it is not. A pre-seeded snapshot is copied in on cold start, so
 *     the app always serves real data.
 *   - There is no WebSocket feed. The client falls back to polling the
 *     occupancy endpoint.
 *
 * For durable hosting with live sockets, run the same code as an ordinary Node
 * process with a mounted disk - see render.yaml.
 */
import { app } from '../src/index.js';

export default app;
