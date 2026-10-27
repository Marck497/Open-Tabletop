import { buildApp } from './app.js';
import { loadConfig } from './config.js';
import { attachRealtime } from './realtime/index.js';

// Última red de seguridad: un fallo inesperado se anota, pero no apaga la mesa a todos.
process.on('unhandledRejection', (reason) => {
  console.error('Promesa rechazada sin capturar:', reason);
});

const config = loadConfig();
const { app, ctx } = await buildApp(config, { logger: true });
attachRealtime(app, ctx);

await app.listen({ port: config.port, host: config.host });

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    app.log.info(`${signal} recibido, cerrando...`);
    void app.close().then(() => process.exit(0));
  });
}
