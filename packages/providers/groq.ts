import type {
    AIProvider,
    ChatRequest,
    ChatChunk,
    Model
} from "../core/types";

/*
 * STRICT GROQ FREE-TIER ALLOWLIST
 *
 * Only models explicitly known to be available
 * on Groq's Free Plan are allowed here.
 *
 * Anything not in this list is BLOCKED.
 */
const FREE_MODELS: Record<string, Partial<Model>> = {
    "openai/gpt-oss-120b": {
        displayName: "GPT-OSS 120B",
        contextLength: 131072,
        toolCalling: true
    },

    "openai/gpt-oss-20b": {
        displayName: "GPT-OSS 20B",
        contextLength: 131072,
        toolCalling: true
    },

    "openai/gpt-oss-safeguard-20b": {
        displayName: "GPT-OSS Safeguard 20B",
        contextLength: 131072,
        toolCalling: true
    },

    "qwen/qwen3.6-27b": {
        displayName: "Qwen 3.6 27B",
        contextLength: 131072,
        toolCalling: true
    },

    "qwen/qwen3.8-27b": {
        displayName: "Qwen 3.8 27B",
        contextLength: 131072,
        toolCalling: true
    },

    "groq/compound": {
        displayName: "Groq Compound",
        contextLength: 131072,
        toolCalling: true
    },

    "groq/compound-mini": {
        displayName: "Groq Compound Mini",
        contextLength: 131072,
        toolCalling: true
    }
};

export class GroqProvider implements AIProvider {
    id = "groq";

    private baseUrl =
        "https://api.groq.com/openai/v1";

    private apiKey: string;

    constructor() {
        const key = process.env.GROQ_API_KEY;

        if (!key) {
            throw new Error(
                "GROQ_API_KEY is not set"
            );
        }

        this.apiKey = key;
    }

    private isFreeModel(
        model: string
    ): boolean {
        return Boolean(FREE_MODELS[model]);
    }

    async *chat(
        request: ChatRequest
    ): AsyncIterable<ChatChunk> {

        /*
         * FINAL COST SAFETY CHECK
         *
         * Never allow a model outside the
         * explicit Free-tier allowlist.
         */
        if (!this.isFreeModel(request.model)) {
            throw new Error(
                `Groq model "${request.model}" is blocked: not in Free-tier allowlist`
            );
        }

        const response = await fetch(
            `${this.baseUrl}/chat/completions`,
            {
                method: "POST",

                headers: {
                    "Authorization":
                        `Bearer ${this.apiKey}`,
                    "Content-Type":
                        "application/json"
                },

                body: JSON.stringify({
                    model: request.model,
                    messages: request.messages,
                    stream: true
                })
            }
        );

        if (!response.ok) {
            const error =
                await response.text();

            throw new Error(
                `Groq error ${response.status}: ${error}`
            );
        }

        if (!response.body) {
            throw new Error(
                "Groq returned no response body"
            );
        }

        const reader =
            response.body.getReader();

        const decoder =
            new TextDecoder();

        let buffer = "";

        while (true) {
            const {
                value,
                done
            } = await reader.read();

            if (done) break;

            buffer += decoder.decode(
                value,
                { stream: true }
            );

            const lines =
                buffer.split("\n");

            buffer =
                lines.pop() ?? "";

            for (const line of lines) {
                if (!line.startsWith("data: ")) {
                    continue;
                }

                const data =
                    line.slice(6).trim();

                if (data === "[DONE]") {
                    return;
                }

                try {
                    const json =
                        JSON.parse(data);

                    const text =
                        json.choices?.[0]
                            ?.delta?.content;

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
        return Object.entries(
            FREE_MODELS
        ).map(([id, info]) => ({
            id,
            provider: this.id,

            displayName:
                info.displayName ?? id,

            contextLength:
                info.contextLength,

            access: "free",
            free: true,

            inputPrice: 0,
            outputPrice: 0,

            toolCalling:
                info.toolCalling ?? true,

            vision:
                info.vision ?? false
        }));
    }

    async health(): Promise<boolean> {
        try {
            const response =
                await fetch(
                    `${this.baseUrl}/models`,
                    {
                        headers: {
                            "Authorization":
                                `Bearer ${this.apiKey}`
                        }
                    }
                );

            return response.ok;
        } catch {
            return false;
        }
    }
}
