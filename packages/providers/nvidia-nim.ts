import type {
    AIProvider,
    ChatRequest,
    ChatChunk,
    Model
} from "../core/types";

/*
 * NVIDIA HOSTED FREE ENDPOINTS
 *
 * IMPORTANT:
 * Only models explicitly verified as NVIDIA
 * "Free Endpoint: Available" belong here.
 *
 * If a model becomes paid/deprecated, remove it.
 */

const FREE_MODELS: Record<string, Partial<Model>> = {

    "moonshotai/kimi-k3": {
        displayName: "Kimi K3",
        contextLength: 1048576,
        toolCalling: true,
        vision: true
    },

    "meta/muse-glimmer-30b": {
        displayName: "Muse Glimmer 30B",
        contextLength: 131072,
        toolCalling: true,
        vision: true
    },

    "deepseek-ai/deepseek-v4-pro-0813": {
        displayName: "DeepSeek V4 Pro",
        contextLength: 262144,
        toolCalling: true
    },

    "deepseek-ai/deepseek-v4-flash-0731": {
        displayName: "DeepSeek V4 Flash",
        contextLength: 1048576,
        toolCalling: true
    },

    "nvidia/nemotron-3.5-lightning-30b-a3b": {
        displayName: "Nemotron 3.5 Lightning",
        contextLength: 1000000,
        toolCalling: true
    },

    "nvidia/nemotron-3-ultra-550b-a55b": {
        displayName: "Nemotron 3 Ultra",
        contextLength: 1000000,
        toolCalling: true
    },

    "nvidia/nemotron-3-super-120b-a12b": {
        displayName: "Nemotron 3 Super",
        contextLength: 262144,
        toolCalling: true
    },

    "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning": {
        displayName: "Nemotron 3 Nano Omni Reasoning",
        contextLength: 256000,
        toolCalling: true,
        vision: true
    },

    "openai/gpt-oss-20b": {
        displayName: "GPT-OSS 20B",
        contextLength: 131072,
        toolCalling: true
    },

    "thinkingmachines/inkling": {
        displayName: "Inkling",
        contextLength: 1048576,
        toolCalling: true,
        vision: true
    },

    "thinkingmachines/inkling-small": {
        displayName: "Inkling Small",
        contextLength: 1048576,
        toolCalling: true,
        vision: true
    },

    "poolside/laguna-s-2.1": {
        displayName: "Laguna S 2.1",
        contextLength: 262144,
        toolCalling: true
    },

    "poolside/laguna-xs-2.1": {
        displayName: "Laguna XS 2.1",
        contextLength: 262144,
        toolCalling: true
    },

    "google/gemma-4-31b-it": {
        displayName: "Gemma 4 31B",
        contextLength: 262144,
        toolCalling: true,
        vision: true
    }
};

export class NvidiaNimProvider implements AIProvider {

    id = "nvidia";

    private apiKey: string;

    private baseUrl =
        "https://integrate.api.nvidia.com/v1";

    constructor() {

        const key =
            process.env.NVIDIA_API_KEY;

        if (!key) {
            throw new Error(
                "NVIDIA_API_KEY is not set"
            );
        }

        this.apiKey = key;
    }

    async *chat(
        request: ChatRequest
    ): AsyncIterable<ChatChunk> {

        /*
         * HARD SECURITY CHECK:
         *
         * Only models in our verified NVIDIA
         * free allowlist can ever be requested.
         */
        if (!FREE_MODELS[request.model]) {

            throw new Error(
                `Blocked non-free NVIDIA model: ${request.model}`
            );
        }

        const response =
            await fetch(
                `${this.baseUrl}/chat/completions`,
                {
                    method: "POST",

                    headers: {
                        "Authorization":
                            `Bearer ${this.apiKey}`,

                        "Content-Type":
                            "application/json",

                        "Accept":
                            "text/event-stream"
                    },

                    body: JSON.stringify({
                        model:
                            request.model,

                        messages:
                            request.messages,

                        stream: true,

                        tools:
                            request.tools,

                        tool_choice:
                            request.tool_choice
                    })
                }
            );

        if (!response.ok) {

            const error =
                await response.text();

            throw new Error(
                `NVIDIA NIM error ${response.status}: ${error}`
            );
        }

        if (!response.body) {

            throw new Error(
                "NVIDIA NIM returned no response body"
            );
        }

        const reader =
            response.body.getReader();

        const decoder =
            new TextDecoder();

        let buffer = "";

        const toolCalls =
            new Map<
                number,
                {
                    id: string;
                    name: string;
                    arguments: string;
                }
            >();

        while (true) {

            const {
                value,
                done
            } = await reader.read();

            if (done) break;

            buffer +=
                decoder.decode(
                    value,
                    { stream: true }
                );

            const lines =
                buffer.split("\n");

            buffer =
                lines.pop() ?? "";

            for (
                const line of lines
            ) {

                if (
                    !line.startsWith(
                        "data: "
                    )
                ) {
                    continue;
                }

                const data =
                    line.slice(6).trim();

                if (
                    data === "[DONE]"
                ) {

                    for (
                        const call
                        of toolCalls.values()
                    ) {

                        yield {
                            type: "tool_call",
                            id: call.id,
                            name: call.name,
                            arguments: call.arguments
                        };
                    }

                    return;
                }

                try {

                    const json =
                        JSON.parse(data);

                    const delta =
                        json
                            .choices?.[0]
                            ?.delta;

                    const text =
                        delta?.content;

                    if (text) {

                        yield {
                            type: "text",
                            text
                        };
                    }

                    const calls =
                        delta?.tool_calls;

                    if (Array.isArray(calls)) {

                        for (const call of calls) {

                            const index =
                                Number(
                                    call.index ?? 0
                                );

                            const existing =
                                toolCalls.get(index) ??
                                {
                                    id: "",
                                    name: "",
                                    arguments: ""
                                };

                            if (call.id) {
                                existing.id =
                                    call.id;
                            }

                            if (
                                call.function?.name
                            ) {
                                existing.name +=
                                    call.function.name;
                            }

                            if (
                                call.function?.arguments
                            ) {
                                existing.arguments +=
                                    call.function.arguments;
                            }

                            toolCalls.set(
                                index,
                                existing
                            );
                        }
                    }

                } catch {
                    // Ignore malformed SSE chunks.
                }
            }
        }

        for (
            const call
            of toolCalls.values()
        ) {

            yield {
                type: "tool_call",
                id: call.id,
                name: call.name,
                arguments: call.arguments
            };
        }
    }

    async listModels(): Promise<Model[]> {

        return Object.entries(
            FREE_MODELS
        ).map(
            ([id, metadata]) => ({

                id,

                provider:
                    this.id,

                displayName:
                    metadata.displayName ??
                    id,

                contextLength:
                    metadata.contextLength,

                access: "free",

                free: true,

                toolCalling:
                    metadata.toolCalling ??
                    false,

                vision:
                    metadata.vision ??
                    false
            })
        );
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
