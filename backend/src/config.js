import dotenv from 'dotenv';
import { fileURLToPath } from 'node:url';

dotenv.config({
  path: fileURLToPath(new URL('../.env', import.meta.url)),
  quiet: true,
});

function port(value, name, fallback) {
  const number = Number(value ?? fallback);
  if (!Number.isInteger(number) || number < 1 || number > 65535) {
    throw new Error(`${name} must be an integer from 1 to 65535.`);
  }
  return number;
}

export function loadConfig(env = process.env) {
  for (const name of ['DB_HOST', 'DB_USER', 'DB_NAME', 'DB_PASSWORD']) {
    if (
      env[name] === undefined ||
      (name !== 'DB_PASSWORD' && !env[name].trim())
    ) {
      throw new Error(
        `Missing ${name}. Copy backend/.env.example to backend/.env and configure MySQL.`,
      );
    }
  }

  return {
    port: port(env.PORT, 'PORT', 3000),
    database: {
      host: env.DB_HOST,
      port: port(env.DB_PORT, 'DB_PORT', 3306),
      user: env.DB_USER,
      password: env.DB_PASSWORD,
      database: env.DB_NAME,
      connectionLimit: 10,
      waitForConnections: true,
      queueLimit: 20,
      connectTimeout: 5000,
      enableKeepAlive: true,
      charset: 'utf8mb4',
      timezone: 'Z',
    },
  };
}
