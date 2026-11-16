import type { ZodRawShape, z } from 'zod';
import type { Services } from '../../services/index.js';

type Tool = <Shape extends ZodRawShape>(
  name: string,
  description: string,
  shape: Shape,
  opts: { readOnly?: boolean; destructive?: boolean },
  run: (args: z.infer<z.ZodObject<Shape>>) => unknown,
) => void;

/** What every group of MCP tools receives: the services, the registration helper and the annotation presets. */
export type ToolContext = Services & { tool: Tool; ro: { readOnly: true }; rw: Record<string, never>; del: { destructive: true } };
