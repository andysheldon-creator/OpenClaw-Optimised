module.exports = {
  apps: [
    {
      name: "openclaw-gateway",
      script: "openclaw.mjs",
      args: "gateway run",
      interpreter: "node",
      cwd: __dirname,
    },
  ],
};
