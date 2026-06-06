import type { SQLJsDatabase } from 'drizzle-orm/sql-js';
import * as schema from '@/db/schema';

export type Db = SQLJsDatabase<typeof schema>;
