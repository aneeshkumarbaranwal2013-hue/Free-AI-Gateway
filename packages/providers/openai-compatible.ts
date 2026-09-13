import type {
    AIProvider,
    ChatRequest,
    ChatChunk,
    Model
} from "../core/types";

interface OpenAICompatibleConfig {
    id: string;
    baseUrl: string;
    apiKeyEnv: string;
}

export class OpenAICompatibleProvider implements AIProvider {
    id: string;

    private baseUrl: string;
    private apiKey: string;

    constructor(config: OpenAICompatibleConfig) {
        this.id = config.id;
        this.baseUrl = config.baseUrl.replace(/\/$/, "");

        const key = process.env[config.apiKeyEnv];

        if (!key) {
            throw new Error(`${config.apiKeyEnv} is not set`);
        }

        this.apiKey = key;
    }

    async *chat(
        request: ChatRequest
    ): AsyncIterable<ChatChunk> {
        const response = await fetch(
            `${this.baseUrl}/chat/completions`,
            {
                method: "POST",
                headers: {
                    "Authorization": `Bearer ${this.apiKey}`,
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    model: request.model,
                    messages: request.messages,
                    stream: true
                })
            }
        );

        if (!response.ok) {
            const error = await response.text();

            throw new Error(
                `${this.id} error ${response.status}: ${error}`
            );
        }

        if (!response.body) {
            throw new Error(
                `${this.id} returned no response body`
            );
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();

        let buffer = "";

        while (true) {
            const { value, done } = await reader.read();

            if (done) break;

            buffer += decoder.decode(value, {
                stream: true
            });

            const lines = buffer.split("\n");
            buffer = lines.pop() ?? "";

            for (const line of lines) {
                if (!line.startsWith("data: ")) {
                    continue;
                }

                const data = line.slice(6).trim();

                if (data === "[DONE]") {
                    return;
                }

                try {
                    const json = JSON.parse(data);

                    const text =
                        json.choices?.[0]?.delta?.content;

                    if (text) {
                        yield {
                            type: "text",
                            text
                        };
                    }
                } catch {
                    // Ignore malformed SSE chunks
                }
            }
        }
    }

    async listModels(): Promise<Model[]> {
        const response = await fetch(
            `${this.baseUrl}/models`,
            {
                headers: {
                    "Authorization": `Bearer ${this.apiKey}`
                }
            }
        );

        if (!response.ok) {
            throw new Error(
                `${this.id} models error ${response.status}`
            );
        }

        const json = await response.json();

        return (json.data ?? []).map((model: any) => ({
            id: model.id,
            provider: this.id,
            displayName: model.name ?? model.id,
            contextLength: model.context_length,
            free: false,
            toolCalling: true,
            vision: false
        }));
    }

    async health(): Promise<boolean> {
        try {
            const response = await fetch(
                `${this.baseUrl}/models`,
                {
                    headers: {
                        "Authorization": `Bearer ${this.apiKey}`
                    }
                }
            );

            return response.ok;
        } catch {
            return false;
        }
    }
}
