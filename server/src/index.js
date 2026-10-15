import 'dotenv/config';
import express from 'express'; import mongoose from 'mongoose'; import cors from 'cors';
import helmet from 'helmet'; import cookieParser from 'cookie-parser'; import { ZodError } from 'zod';
import routes from './routes/index.js';
import { migrateLegacyData } from './config/migrate.js';
const app = express();
const origins = (process.env.CLIENT_ORIGIN || 'http://localhost:5173').split(',').map((x) => x.trim()).filter(Boolean);
app.use(helmet(), cors({ origin: (origin, done) => done(null, !origin || origins.includes(origin)), credentials: true }), express.json({ limit: '1mb' }), cookieParser());
app.get('/health', (req, res) => res.json({ ok: true }));
app.use('/api/v1', routes);
app.use((e, q, s, n) => e instanceof ZodError
  ? s.status(400).json({ error: 'Validation failed', details: e.issues })
  : e.name === 'CastError'
    ? s.status(400).json({ error: 'Invalid identifier' })
  : e.code === 11000
    ? s.status(409).json({ error: 'A record with that unique value already exists' })
  : e.name === 'MulterError'
    ? s.status(e.code === 'LIMIT_FILE_SIZE' ? 413 : 400).json({ error: e.message })
  : e.status
    ? s.status(e.status).json({ error: e.message })
  : (console.error(e), s.status(e.status || 500).json({ error: e.status ? e.message : 'Server error' })));
await mongoose.connect(process.env.MONGO_URI);
const migration = await migrateLegacyData();
if (migration.migratedFloors || migration.migratedPlans || migration.synchronizedPrograms) {
  console.log(`SeatWise compatibility migration: ${migration.migratedFloors} floors, ${migration.migratedPlans} plans, ${migration.synchronizedPrograms} programs.`);
}
app.listen(process.env.PORT || 5000, () => console.log('SeatWise API up'));
