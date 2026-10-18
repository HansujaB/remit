import { createApp } from "./app.js";
import { config } from "./config.js";
import { closeDatabase } from "./graph.js";
const server = createApp().listen(config.PORT, config.HOST, () =>
  console.log(`Remit API: http://${config.HOST}:${config.PORT}`),
);
for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, () => {
    server.close(() => void closeDatabase());
  });
