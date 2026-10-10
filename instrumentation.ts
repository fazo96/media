// Runs once as the server starts (lib/startup.ts, on Node only: the proxy's
// edge build gets this file too, and can't load Node's modules).
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") await (await import("./lib/startup")).startup();
}
