require('dotenv').config();
const config = require("./src/config");
const { ClusterManager } = require("discord-hybrid-sharding");

const manager = new ClusterManager("./index.js", {
  totalShards: "auto",
  shardsPerCluster: 1,
  mode: "process",
  token: config.token,
  respawn: false,
  restarts: {
    max: 5,
    interval: 1000,
  },
  execArgv: ["--no-warnings"],
});

manager.on("clusterCreate", (cluster) => {
  console.log(`[ShardManager] Launched cluster ${cluster.id}`);
});

async function shutdown() {
  console.log("[ShardManager] Shutting down...");

  manager.clusters.forEach((cluster) => {
    try {
      cluster.kill();
    } catch (err) {
      console.error(err);
    }
  });

  process.exit(0);
}

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);

manager.spawn({ timeout: -1 });