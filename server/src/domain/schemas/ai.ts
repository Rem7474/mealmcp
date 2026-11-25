import { z } from 'zod';

export const aiChat = z.object({
  messages: z
    .array(
      z.object({
        role: z.enum(['user', 'assistant']),
        content: z.string().trim().min(1).max(2000),
      }),
    )
    .min(1)
    .max(12)
    .refine((m) => m.at(-1)?.role === 'user', { message: 'The last message must be from the user' })
    .describe('The conversation so far, oldest first. Nothing is stored on the server'),
});
