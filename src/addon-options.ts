import { z } from 'zod';

const optionsSchema = z.object({
  skyward_url: z.string().min(1),
  username: z.string().min(1),
  password: z.string().min(1),
  mcp_token: z.string().min(32).regex(/^\S+$/),
  timezone: z.string().min(1).default('America/Los_Angeles'),
  timeout_ms: z.number().int().min(1000).max(180000).default(45000),
});

export function addonEnvironment(input: unknown): NodeJS.ProcessEnv {
  const result = optionsSchema.safeParse(input);
  if (!result.success) {
    // Report field names only. Validation input can contain credentials.
    const fields = [...new Set(result.error.issues.map(issue => issue.path.join('.')))];
    throw new Error(`Invalid add-on configuration: ${fields.join(', ')}. Check the Configuration tab.`);
  }
  const options = result.data;
  return {
    SKYWARD_BASE_URL: options.skyward_url,
    SKYWARD_USERNAME: options.username,
    SKYWARD_PASSWORD: options.password,
    SKYWARD_HTTP_TOKEN: options.mcp_token,
    SKYWARD_TIMEZONE: options.timezone,
    SKYWARD_TIMEOUT_MS: String(options.timeout_ms),
    SKYWARD_BROWSER: 'chromium',
    SKYWARD_HTTP_HOST: '0.0.0.0',
    SKYWARD_HTTP_PORT: '3000',
  };
}
