/**
 * Deve ser o primeiro import de main.ts — garante .env carregado antes de qualquer
 * outro módulo que leia process.env (nest / wa-engine).
 */
import { config } from 'dotenv';
import * as path from 'path';

const envPath = path.join(__dirname, '../.env');
config({ path: envPath });
