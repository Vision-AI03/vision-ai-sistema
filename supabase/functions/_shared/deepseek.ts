// Cliente DeepSeek — API OpenAI-compatível. Usado para IA de ALTO VOLUME
// (triagem, curadoria, dedup, classificação) onde economia de token importa mais
// que a qualidade de escrita do Claude Sonnet. Relatórios finais continuam no Claude.
//
// Secret necessário nos Supabase secrets: DEEPSEEK_API_KEY
// Docs: https://api-docs.deepseek.com — modelos: deepseek-chat (V3), deepseek-reasoner (R1)

export const MODEL_DEEPSEEK_CHAT = "deepseek-chat";       // rápido/barato — triagem e geração
export const MODEL_DEEPSEEK_REASONER = "deepseek-reasoner"; // raciocínio (mais caro/lento)

const DEEPSEEK_API_URL = "https://api.deepseek.com/v1/chat/completions";

function getApiKey(): string {
  const apiKey = Deno.env.get("DEEPSEEK_API_KEY");
  if (!apiKey) {
    throw new Error("DEEPSEEK_API_KEY is not configured in Supabase secrets");
  }
  return apiKey;
}

interface DeepSeekMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

async function postDeepSeek(body: Record<string, unknown>): Promise<any> {
  const res = await fetch(DEEPSEEK_API_URL, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${getApiKey()}`,
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const errBody = await res.text();
    throw new Error(`DeepSeek API error: status=${res.status} body=${errBody}`);
  }
  return await res.json();
}

export interface CallDeepSeekParams {
  prompt: string;
  system?: string;
  model?: string;
  maxTokens?: number;
  temperature?: number;
}

// Chamada de texto simples.
export async function callDeepSeek({
  prompt,
  system,
  model = MODEL_DEEPSEEK_CHAT,
  maxTokens = 4096,
  temperature = 0.3,
}: CallDeepSeekParams): Promise<string> {
  const messages: DeepSeekMessage[] = [];
  if (system) messages.push({ role: "system", content: system });
  messages.push({ role: "user", content: prompt });

  const data = await postDeepSeek({
    model,
    max_tokens: maxTokens,
    temperature,
    messages,
  });

  const text = data?.choices?.[0]?.message?.content;
  if (typeof text !== "string") {
    throw new Error(`DeepSeek API returned no text. Raw response: ${JSON.stringify(data)}`);
  }
  return text;
}

// Saída estruturada JSON — usa o modo json_object do DeepSeek. O prompt DEVE
// instruir o modelo a responder em JSON e conter a palavra "json". Retorna o objeto parseado.
export async function callDeepSeekJson<T = Record<string, unknown>>({
  prompt,
  system,
  model = MODEL_DEEPSEEK_CHAT,
  maxTokens = 4096,
  temperature = 0.2,
}: CallDeepSeekParams): Promise<T> {
  const messages: DeepSeekMessage[] = [];
  if (system) messages.push({ role: "system", content: system });
  messages.push({ role: "user", content: prompt });

  const data = await postDeepSeek({
    model,
    max_tokens: maxTokens,
    temperature,
    messages,
    response_format: { type: "json_object" },
  });

  const raw = data?.choices?.[0]?.message?.content;
  if (typeof raw !== "string") {
    throw new Error(`DeepSeek API returned no content. Raw response: ${JSON.stringify(data)}`);
  }
  try {
    return JSON.parse(raw) as T;
  } catch {
    throw new Error(`DeepSeek did not return valid JSON. Raw: ${raw}`);
  }
}
