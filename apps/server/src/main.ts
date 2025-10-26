import { createApp } from './app.js';

const host = process.env.HOST ?? 'localhost';
const port = process.env.PORT ? Number(process.env.PORT) : 3001;

const app = createApp();

app.listen(port, host, () => {
  console.log(`[ ready ] http://${host}:${port}`);
  console.log(`[ health ] http://${host}:${port}/api/health`);
  console.log(`[ hello ] http://${host}:${port}/api/hello`);
  console.log(`[ docs ] http://${host}:${port}/api/docs`);
  console.log(`[ spec ] http://${host}:${port}/api/docs/openapi.json`);
});
