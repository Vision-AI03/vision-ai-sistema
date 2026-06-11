export const MODEL_HAIKU = "claude-haiku-4-5-20251001";
export const MODEL_SONNET = "claude-sonnet-4-6";

const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_VERSION = "2023-06-01";

function getApiKey(): string {
  const apiKey = Deno.env.get("CLAUDE_API_KEY");
  if (!apiKey) {
    throw new Error("CLAUDE_API_KEY is not configured in Supabase secrets");
  }
  return apiKey;
}

async function postAnthropic(body: Record<string, unknown>): Promise<any> {
  const res = await fetch(ANTHROPIC_API_URL, {
    method: "POST",
    headers: {
      "x-api-key": getApiKey(),
      "anthropic-version": ANTHROPIC_VERSION,
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const errBody = await res.text();
    throw new Error(`Anthropic API error: status=${res.status} body=${errBody}`);
  }
  return await res.json();
}

export interface CallClaudeParams {
  model: string;
  prompt: string;
  system?: string;
  maxTokens?: number;
  temperature?: number;
}

export async function callClaude({
  model,
  prompt,
  system,
  maxTokens = 4096,
  temperature = 0.3,
}: CallClaudeParams): Promise<string> {
  const body: Record<string, unknown> = {
    model,
    max_tokens: maxTokens,
    temperature,
    messages: [{ role: "user", content: prompt }],
  };
  if (system) body.system = system;

  const data = await postAnthropic(body);
  const text = data?.content?.[0]?.text;
  if (typeof text !== "string") {
    throw new Error(
      `Anthropic API returned no text. Raw response: ${JSON.stringify(data)}`
    );
  }
  return text;
}

// Conversa com múltiplas mensagens (incluindo content blocks multimodais).
export interface ClaudeMessage {
  role: "user" | "assistant";
  content: string | unknown[];
}

export interface CallClaudeMessagesParams {
  model: string;
  messages: ClaudeMessage[];
  system?: string;
  maxTokens?: number;
  temperature?: number;
}

export async function callClaudeMessages({
  model,
  messages,
  system,
  maxTokens = 4096,
  temperature = 0.3,
}: CallClaudeMessagesParams): Promise<string> {
  const body: Record<string, unknown> = {
    model,
    max_tokens: maxTokens,
    temperature,
    messages,
  };
  if (system) body.system = system;

  const data = await postAnthropic(body);
  const text = data?.content?.find((b: { type?: string }) => b.type === "text")?.text;
  if (typeof text !== "string") {
    throw new Error(
      `Anthropic API returned no text. Raw response: ${JSON.stringify(data)}`
    );
  }
  return text;
}

// Tool use forçado: passe content blocks OU messages, e um tool schema;
// retorna o objeto `input` extraído pelo modelo. Usado para extração estruturada.
export interface ClaudeTool {
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
}

export interface CallClaudeWithToolParams {
  model: string;
  tool: ClaudeTool;
  content?: unknown[]; // single user message com content blocks
  messages?: ClaudeMessage[]; // conversa completa
  system?: string;
  maxTokens?: number;
  temperature?: number;
}

export async function callClaudeWithTool<T = Record<string, unknown>>({
  model,
  tool,
  content,
  messages,
  system,
  maxTokens = 4096,
  temperature = 0,
}: CallClaudeWithToolParams): Promise<T> {
  if (!content && !messages) {
    throw new Error("callClaudeWithTool requires either content or messages");
  }
  const finalMessages: ClaudeMessage[] = messages ?? [
    { role: "user", content: content! },
  ];
  const body: Record<string, unknown> = {
    model,
    max_tokens: maxTokens,
    temperature,
    messages: finalMessages,
    tools: [tool],
    tool_choice: { type: "tool", name: tool.name },
  };
  if (system) body.system = system;

  const data = await postAnthropic(body);
  const toolBlock = (data?.content ?? []).find(
    (b: { type?: string; name?: string }) =>
      b.type === "tool_use" && b.name === tool.name
  );
  if (!toolBlock?.input) {
    throw new Error(
      `Anthropic API returned no tool_use input for "${tool.name}". Raw response: ${JSON.stringify(data)}`
    );
  }
  return toolBlock.input as T;
}
