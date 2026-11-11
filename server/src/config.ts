export interface Config {
  port: number;
  databasePath: string;
  /** Public origin of the app (no path), used for OAuth metadata, redirects and cookie security. */
  publicUrl: URL;
  /** When false, only the very first account and invited people can register. */
  allowRegistration: boolean;
  /** Express "trust proxy" value: number of reverse-proxy hops in front of the app. */
  trustProxy: number;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const port = Number(env.PORT ?? 3000);
  const publicUrl = new URL(env.PUBLIC_URL || `http://localhost:${port}`);
  publicUrl.pathname = '/';
  return {
    port,
    databasePath: env.DATABASE_PATH ?? './data/mealmcp.db',
    publicUrl,
    allowRegistration: env.ALLOW_REGISTRATION === 'true',
    trustProxy: Number(env.TRUST_PROXY ?? 0),
  };
}

export const isSecure = (config: Config) => config.publicUrl.protocol === 'https:';
