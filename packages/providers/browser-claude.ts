import type {
    AIProvider,
    ChatRequest,
    ChatChunk,
    Model
} from "../core/types";

export class BrowserClaudeProvider
    implements AIProvider
{
    id = "browser-claude";

    private baseUrl =
        process.env.CLAUDE_BRIDGE_URL ??
        "http://127.0.0.1:8766";

    private token: string;

    constructor() {
        const token =
            process.env.BROWSER_BRIDGE_TOKEN;

        if (!token) {
            throw new Error(
                "BROWSER_BRIDGE_TOKEN is not set"
            );
        }

        this.token = token;
    }

    async *chat(
        request: ChatRequest
    ): AsyncIterable<ChatChunk> {
        if (
            request.model !==
            "browser/claude"
        ) {
            throw new Error(
                `Unsupported Claude browser model: ${request.model}`
            );
        }

        const response =
            await fetch(
                `${this.baseUrl}/v1/chat/completions`,
                {
                    method: "POST",

                    headers: {
                        "Authorization":
                            `Bearer ${this.token}`,

                        "Content-Type":
                            "application/json"
                    },

                    body: JSON.stringify({
                        messages:
                            request.messages
                    })
                }
            );

        if (!response.ok) {
            const error =
                await response.text();

            throw new Error(
                `Claude browser bridge error ${response.status}: ${error}`
            );
        }

        const json =
            await response.json();

        const text =
            json.choices?.[0]?.message?.content;

        if (!text) {
            throw new Error(
                "Claude browser bridge returned no text"
            );
        }

        yield {
            type: "text",
            text
        };
    }

    async listModels(): Promise<Model[]> {
        return [
            {
                id: "browser/claude",

                provider:
                    this.id,

                displayName:
                    "Claude Web (Browser)",

                contextLength:
                    200000,

                access:
                    "browser",

                free:
                    true,

                inputPrice:
                    0,

                outputPrice:
                    0,

                toolCalling:
                    false,

                vision:
                    false
            }
        ];
    }

    async health(): Promise<boolean> {
        try {
            const response =
                await fetch(
                    `${this.baseUrl}/health`
                );

            return response.ok;
        } catch {
            return false;
        }
    }
}
