import express from 'express';
import { apiRouter } from './routes';

const host = process.env.HOST ?? 'localhost';
const port = process.env.PORT ? Number(process.env.PORT) : 3001;

const app = express();

// Middleware
app.use(express.json());

// Root endpoint (keep for backwards compatibility)
app.get('/', (_req, res) => {
  res.send({ message: 'Hello API' });
});

// Mount API routes under /api prefix
app.use('/api', apiRouter);

app.listen(port, host, () => {
  console.log(`[ ready ] http://${host}:${port}`);
  console.log(`[ health ] http://${host}:${port}/api/health`);
});
