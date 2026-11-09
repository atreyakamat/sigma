import Anthropic from '@anthropic-ai/sdk';
import type { AiProviderKind } from '@sigma/validation';

/** A tool the assistant can call. `run` returns the text shown to the model. */
export interface AgentTool {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  run(input: unknown): Promise<string>;
}
export interface AgentInput {
  system: string;
  history: { role: 'user' | 'assistant'; content: string }[];
  tools: AgentTool[];
  maxSteps: number;
}
export interface AgentStep {
  tool: string;
  input: unknown;
  output: string;
  isError: boolean;
}
export interface AgentResult {
  text: string;
  steps: AgentStep[];
  stopReason: string;
}
export interface ProviderConfig {
  kind: AiProviderKind;
  model: string;
  apiKey: string | null;
  baseUrl: string | null;
}

/** Raised for provider failures the user can act on (bad key, rate limit, unreachable endpoint). */
export class ProviderError extends Error {
  constructor(
    message: string,
    readonly status = 502,
  ) {
    super(message);
  }
}

async function runTool(
  tools: AgentTool[],
  name: string,
  input: unknown,
  steps: AgentStep[],
): Promise<{ output: string; isError: boolean }> {
  const tool = tools.find((t) => t.name === name);
  let output: string;
  let isError = false;
  if (!tool) {
    output = `Unknown tool "${name}"`;
    isError = true;
  } else {
    try {
      output = await tool.run(input);
    } catch (e) {
      output = e instanceof Error ? e.message : String(e);
      isError = true;
    }
  }
  steps.push({ tool: name, input, output, isError });
  return { output, isError };
}

/* ------------------------------------------------------------------ Anthropic (official SDK) */

/** Models that accept the server-side refusal fallback parameter. */
const FALLBACK_MODELS = new Set([
  'claude-fable-5-1',
  'claude-opus-5-5',
  'claude-opus-5',
  'claude-sonnet-5-5',
]);

async function runAnthropic(config: ProviderConfig, input: AgentInput): Promise<AgentResult> {
  if (!config.apiKey) throw new ProviderError('This provider has no API key configured', 400);
  const client = new Anthropic({
    apiKey: config.apiKey,
    ...(config.baseUrl ? { baseURL: config.baseUrl } : {}),
  });
  const tools: Anthropic.Tool[] = input.tools.map((t) => ({
    name: t.name,
    description: t.description,
    input_schema: t.inputSchema as Anthropic.Tool.InputSchema,
  }));
  const messages: Anthropic.MessageParam[] = input.history.map((m) => ({
    role: m.role,
    content: m.content,
  }));
  const steps: AgentStep[] = [];
  // Refusal fallbacks are opt-in; enable them on first-party endpoints for models that support them.
  const useFallback = !config.baseUrl && FALLBACK_MODELS.has(config.model);
  let text = '';
  try {
    for (let i = 0; i < input.maxSteps; i++) {
      const params = {
        model: config.model,
        max_tokens: 16000,
        system: input.system,
        tools,
        messages,
      };
      const response = useFallback
        ? ((await client.beta.messages.create({
            ...params,
            betas: ['server-side-fallback-2026-07-01'],
            fallbacks: 'default',
          } as unknown as Parameters<
            typeof client.beta.messages.create
          >[0])) as unknown as Anthropic.Message)
        : await client.messages.create(params);
      text = response.content
        .filter((b): b is Anthropic.TextBlock => b.type === 'text')
        .map((b) => b.text)
        .join('\n')
        .trim();
      if (response.stop_reason === 'refusal')
        return { text: text || 'The model declined this request.', steps, stopReason: 'refusal' };
      if (response.stop_reason === 'pause_turn') {
        messages.push({ role: 'assistant', content: response.content });
        continue;
      }
      if (response.stop_reason !== 'tool_use')
        return { text, steps, stopReason: response.stop_reason ?? 'end_turn' };
      // Keep the full content (thinking blocks included) so the next request replays it unchanged.
      messages.push({ role: 'assistant', content: response.content });
      const calls = response.content.filter(
        (b): b is Anthropic.ToolUseBlock => b.type === 'tool_use',
      );
      const results: Anthropic.ToolResultBlockParam[] = [];
      for (const call of calls) {
        const { output, isError } = await runTool(input.tools, call.name, call.input, steps);
        results.push({
          type: 'tool_result',
          tool_use_id: call.id,
          content: output,
          ...(isError ? { is_error: true } : {}),
        });
      }
      // All results of one assistant turn go back in a single user message.
      messages.push({ role: 'user', content: results });
    }
    return {
      text: text || 'Stopped after the maximum number of steps.',
      steps,
      stopReason: 'max_steps',
    };
  } catch (e) {
    if (e instanceof Anthropic.AuthenticationError)
      throw new ProviderError('The provider rejected the API key', 400);
    if (e instanceof Anthropic.PermissionDeniedError)
      throw new ProviderError('The API key is not allowed to use this model', 400);
    if (e instanceof Anthropic.NotFoundError)
      throw new ProviderError(`Model "${config.model}" was not found at the provider`, 400);
    if (e instanceof Anthropic.RateLimitError)
      throw new ProviderError('The provider is rate limiting requests; try again shortly', 429);
    if (e instanceof Anthropic.BadRequestError)
      throw new ProviderError(`The provider rejected the request: ${e.message}`, 400);
    if (e instanceof Anthropic.APIConnectionError)
      throw new ProviderError('Could not reach the provider');
    if (e instanceof Anthropic.APIError)
      throw new ProviderError(`Provider error ${e.status ?? ''}: ${e.message}`.trim());
    throw e;
  }
}

/* ------------------------------------------------------------------ OpenAI-compatible (chat completions) */

interface OpenAiMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string | null;
  tool_calls?: { id: string; type: 'function'; function: { name: string; arguments: string } }[];
  tool_call_id?: string;
}

async function runOpenAiCompatible(
  config: ProviderConfig,
  input: AgentInput,
): Promise<AgentResult> {
  const base = (config.baseUrl ?? 'https://api.openai.com/v1').replace(/\/+$/, '');
  if (config.kind === 'openai' && !config.apiKey)
    throw new ProviderError('This provider has no API key configured', 400);
  const messages: OpenAiMessage[] = [
    { role: 'system', content: input.system },
    ...input.history.map((m) => ({ role: m.role, content: m.content }) as OpenAiMessage),
  ];
  const tools = input.tools.map((t) => ({
    type: 'function' as const,
    function: { name: t.name, description: t.description, parameters: t.inputSchema },
  }));
  const steps: AgentStep[] = [];
  let text = '';
  for (let i = 0; i < input.maxSteps; i++) {
    let res: Response;
    try {
      res = await fetch(`${base}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(config.apiKey ? { Authorization: `Bearer ${config.apiKey}` } : {}),
        },
        body: JSON.stringify({ model: config.model, messages, ...(tools.length ? { tools } : {}) }),
        signal: AbortSignal.timeout(120_000),
      });
    } catch {
      throw new ProviderError(`Could not reach ${base}`);
    }
    if (!res.ok) {
      const detail = (await res.text().catch(() => '')).slice(0, 300);
      if (res.status === 401 || res.status === 403)
        throw new ProviderError('The provider rejected the API key', 400);
      if (res.status === 404)
        throw new ProviderError(
          `Model "${config.model}" or the endpoint was not found at the provider`,
          400,
        );
      if (res.status === 429)
        throw new ProviderError('The provider is rate limiting requests; try again shortly', 429);
      throw new ProviderError(`Provider error ${res.status}${detail ? `: ${detail}` : ''}`);
    }
    const body = (await res.json()) as {
      choices?: { message?: OpenAiMessage; finish_reason?: string }[];
    };
    const choice = body.choices?.[0];
    const message = choice?.message;
    if (!message) throw new ProviderError('The provider returned no message');
    text = (message.content ?? '').trim();
    const calls = message.tool_calls ?? [];
    if (calls.length === 0) return { text, steps, stopReason: choice?.finish_reason ?? 'stop' };
    messages.push({ role: 'assistant', content: message.content ?? null, tool_calls: calls });
    for (const call of calls) {
      let args: unknown = {};
      let parseError: string | null = null;
      try {
        args = call.function.arguments ? JSON.parse(call.function.arguments) : {};
      } catch {
        parseError = 'Tool arguments were not valid JSON';
      }
      const { output } = parseError
        ? (steps.push({
            tool: call.function.name,
            input: call.function.arguments,
            output: parseError,
            isError: true,
          }),
          { output: parseError })
        : await runTool(input.tools, call.function.name, args, steps);
      messages.push({ role: 'tool', tool_call_id: call.id, content: output });
    }
  }
  return {
    text: text || 'Stopped after the maximum number of steps.',
    steps,
    stopReason: 'max_steps',
  };
}

/* ------------------------------------------------------------------ Demo (no model: rule-based) */

const COLOR_WORDS: Record<string, string> = {
  red: '#ef4444',
  orange: '#f97316',
  yellow: '#eab308',
  green: '#22c55e',
  teal: '#14b8a6',
  blue: '#2563eb',
  purple: '#8b5cf6',
  pink: '#ec4899',
  black: '#111111',
  white: '#ffffff',
  gray: '#9ca3af',
  grey: '#9ca3af',
};
const SHAPE_WORDS: Record<string, string> = {
  rectangle: 'RECTANGLE',
  rect: 'RECTANGLE',
  square: 'RECTANGLE',
  box: 'RECTANGLE',
  card: 'RECTANGLE',
  button: 'RECTANGLE',
  circle: 'ELLIPSE',
  ellipse: 'ELLIPSE',
  oval: 'ELLIPSE',
  frame: 'FRAME',
  screen: 'FRAME',
  artboard: 'FRAME',
  text: 'TEXT',
  label: 'TEXT',
  heading: 'TEXT',
  title: 'TEXT',
  line: 'LINE',
  star: 'STAR',
  polygon: 'POLYGON',
};

/**
 * Deterministic stand-in for a model so the assistant can be tried (and tested) without any
 * provider account. Understands a handful of plain commands; everything else gets a hint.
 */
async function runDemo(input: AgentInput): Promise<AgentResult> {
  const steps: AgentStep[] = [];
  const last = [...input.history].reverse().find((m) => m.role === 'user')?.content ?? '';
  const lower = last.toLowerCase();
  const apply = input.tools.find((t) => t.name === 'apply_document_ops');
  const outline = input.tools.find((t) => t.name === 'get_document_outline');
  const note =
    '\n\n(Demo provider: rule-based, no AI model. Add a real provider under Admin → AI providers.)';

  if (
    /\b(list|show|what'?s in|outline|layers)\b/.test(lower) &&
    outline &&
    !/\b(add|create|draw|make)\b/.test(lower)
  ) {
    const { output } = await runTool(input.tools, outline.name, {}, steps);
    const parsed = JSON.parse(output) as {
      name: string;
      nodeCount: number;
      pages: { name: string; children: { name: string; type: string }[] }[];
    };
    const lines = parsed.pages.flatMap((p) =>
      p.children.map((c) => `• ${c.name} (${c.type.toLowerCase()})`),
    );
    return {
      text: `"${parsed.name}" has ${parsed.nodeCount} layer${parsed.nodeCount === 1 ? '' : 's'}.\n${lines.slice(0, 30).join('\n')}${note}`,
      steps,
      stopReason: 'end_turn',
    };
  }

  const shapeWord = Object.keys(SHAPE_WORDS).find((w) => new RegExp(`\\b${w}s?\\b`).test(lower));
  if (/\b(add|create|draw|make|insert)\b/.test(lower) && shapeWord) {
    if (!apply)
      return {
        text: `You have view-only access to this file, so I cannot change it.${note}`,
        steps,
        stopReason: 'end_turn',
      };
    const type = SHAPE_WORDS[shapeWord]!;
    const colorWord = Object.keys(COLOR_WORDS).find((w) => new RegExp(`\\b${w}\\b`).test(lower));
    const hex = /#[0-9a-f]{3,8}\b/i.exec(last)?.[0];
    const named =
      /\b(?:named|called)\s+"?([^"\n]+?)"?(?:\s+(?:with|at|sized?|that|in)\b|\s+\d{2,4}\s*(?:x|×|by)\s*\d|[.,]|$)/i
        .exec(last)?.[1]
        ?.trim();
    const size = /(\d{2,4})\s*(?:x|×|by)\s*(\d{2,4})/i.exec(last);
    const quoted = /"([^"]+)"|'([^']+)'/.exec(last);
    const textContent =
      type === 'TEXT'
        ? (/\b(?:saying|that says|with text|reading)\s+"?([^"\n]+?)"?$/i.exec(last)?.[1] ??
          quoted?.[1] ??
          quoted?.[2] ??
          'Text')
        : undefined;
    const op: Record<string, unknown> = {
      op: 'add',
      type,
      name:
        named ??
        (type === 'TEXT' ? textContent : shapeWord.charAt(0).toUpperCase() + shapeWord.slice(1)),
      x: 80,
      y: 80,
      ...(size
        ? { width: Number(size[1]), height: Number(size[2]) }
        : type === 'FRAME'
          ? { width: 390, height: 844 }
          : type === 'TEXT'
            ? {}
            : {
                width: 200,
                height:
                  shapeWord === 'button'
                    ? 56
                    : shapeWord === 'square' || type === 'ELLIPSE'
                      ? 200
                      : 120,
              }),
      ...(hex || colorWord ? { fill: hex ?? COLOR_WORDS[colorWord!] } : {}),
      ...(shapeWord === 'button' || shapeWord === 'card' ? { cornerRadius: 12 } : {}),
      ...(textContent
        ? { text: textContent, fontSize: /heading|title/.test(shapeWord) ? 32 : 16 }
        : {}),
    };
    const { output, isError } = await runTool(input.tools, apply.name, { ops: [op] }, steps);
    return {
      text: isError
        ? `That did not work: ${output}${note}`
        : `Added ${op['name'] as string} to the page.${note}`,
      steps,
      stopReason: 'end_turn',
    };
  }

  const del = /\b(?:delete|remove)\s+(?:the\s+)?(?:layer\s+)?"?([^"\n]+?)"?\s*$/i.exec(last);
  const ren = /\brename\s+(?:the\s+)?(?:layer\s+)?"?([^"\n]+?)"?\s+to\s+"?([^"\n]+?)"?\s*$/i.exec(
    last,
  );
  if ((del || ren) && outline) {
    if (!apply)
      return {
        text: `You have view-only access to this file, so I cannot change it.${note}`,
        steps,
        stopReason: 'end_turn',
      };
    const { output } = await runTool(input.tools, outline.name, {}, steps);
    const parsed = JSON.parse(output) as {
      pages: { children: { id: string; name: string; children?: unknown[] }[] }[];
    };
    const flat: { id: string; name: string }[] = [];
    const walk = (n: { id: string; name: string; children?: unknown[] }) => {
      flat.push(n);
      (n.children as { id: string; name: string; children?: unknown[] }[] | undefined)?.forEach(
        walk,
      );
    };
    parsed.pages.forEach((p) => p.children.forEach(walk));
    const wanted = (ren ? ren[1] : del![1])!.toLowerCase();
    const target = flat.find((n) => n.name.toLowerCase() === wanted);
    if (!target)
      return {
        text: `I could not find a layer named "${ren ? ren[1] : del![1]}".${note}`,
        steps,
        stopReason: 'end_turn',
      };
    const op = ren
      ? { op: 'update', id: target.id, name: ren[2] }
      : { op: 'delete', id: target.id };
    await runTool(input.tools, apply.name, { ops: [op] }, steps);
    return {
      text: `${ren ? `Renamed "${target.name}" to "${ren[2]}"` : `Deleted "${target.name}"`}.${note}`,
      steps,
      stopReason: 'end_turn',
    };
  }

  return {
    text: `I am the demo assistant and understand a few commands, for example:\n• add a blue rectangle named Hero 320x200\n• create a frame called Home\n• add text saying Welcome\n• rename Hero to Banner\n• delete Banner\n• list layers${note}`,
    steps,
    stopReason: 'end_turn',
  };
}

export function runAgent(config: ProviderConfig, input: AgentInput): Promise<AgentResult> {
  switch (config.kind) {
    case 'anthropic':
      return runAnthropic(config, input);
    case 'openai':
    case 'openai_compatible':
      return runOpenAiCompatible(config, input);
    case 'demo':
      return runDemo(input);
  }
}
