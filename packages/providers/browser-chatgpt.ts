import type {
    AIProvider,
    ChatRequest,
    ChatChunk,
    Model
} from "../core/types";

export class BrowserChatGPTProvider implements AIProvider {
    id = "browser-chatgpt";

    private baseUrl =
        process.env.BROWSER_BRIDGE_URL ??
        "http://127.0.0.1:8765";

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
        if (request.model !== "browser/chatgpt") {
            throw new Error(
                `Unsupported browser model: ${request.model}`
            );
        }

        const response = await fetch(
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
                    messages: request.messages
                })
            }
        );

        if (!response.ok) {
            const error =
                await response.text();

            throw new Error(
                `Browser bridge error ${response.status}: ${error}`
            );
        }

        const json =
            await response.json();

        const text =
            json.choices?.[0]?.message?.content;

        if (!text) {
            throw new Error(
                "Browser bridge returned no text"
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
                id: "browser/chatgpt",
                provider: this.id,
                displayName:
                    "ChatGPT Web (Browser)",
                contextLength: 128000,
                access: "browser",
                free: true,
                inputPrice: 0,
                outputPrice: 0,
                toolCalling: false,
                vision: false
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
