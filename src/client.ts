/**
 * Thin wrapper around @rhost/testkit RhostClient.
 * Provides a connected client from LoaderConfig and ensures
 * login + cleanup are handled uniformly.
 */
import { RhostClient } from '@rhost/testkit';
import { LoaderConfig } from './types';

export async function withClient<T>(
  config: LoaderConfig,
  fn: (client: RhostClient) => Promise<T>
): Promise<T> {
  const client = new RhostClient({
    host: config.host,
    port: config.port,
  });
  await client.connect();
  await client.login(config.username, config.password);
  try {
    return await fn(client);
  } finally {
    await client.disconnect();
  }
}
