import { discordClient } from "../discordClient";
import { decodeToBigInt } from "../functions/recode";
import { getEverythingFromDiscord } from "../functions/moonscript";

export async function get(req, res) {
  res.header('Content-Type','application/json');
  
  const { server64 } = req.params;
  const isNotServiceWorkerJS = server64.trim() !== "service-worker.js";
  const isNotServiceWorkerHTML = server64.trim() !== "service-worker-index.html"
  let data = {}
  
  if (server64 && isNotServiceWorkerJS && isNotServiceWorkerHTML) {
    const serverID = decodeToBigInt(server64).toString();
    data = await getEverythingFromDiscord(serverID, discordClient);
  }
  
  res.end(JSON.stringify(data));
}