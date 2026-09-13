import type {
    AIProvider,
    ChatRequest,
    ChatChunk,
    Model
} from "../core/types";

export class OpenRouterProvider
    implements AIProvider {

    id = "openrouter";

    private apiKey: string;

    constructor() {

        const key =
            process.env.OPENROUTER_API_KEY;

        if (!key) {
            throw new Error(
                "OPENROUTER_API_KEY is not set"
            );
        }

        this.apiKey = key;
    }

    /*
     * ZERO-COST FIREWALL
     *
     * Only these OpenRouter IDs are allowed:
     *
     *   model:free
     *   openrouter/free
     *
     * Anything else is rejected.
     */
    private isFreeModelId(
        id: string
    ): boolean {

        return (
            id === "openrouter/free" ||
            id.endsWith(":free")
        );
    }

    async *chat(
        request: ChatRequest
    ): AsyncIterable<ChatChunk> {

        if (
            !this.isFreeModelId(
                request.model
            )
        ) {

            throw new Error(
                `ZERO-COST FIREWALL: blocked non-free OpenRouter model: ${request.model}`
            );
        }

        const response =
            await fetch(
                "https://openrouter.ai/api/v1/chat/completions",
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
                `OpenRouter error ${response.status}: ${error}`
            );
        }

        if (!response.body) {

            throw new Error(
                "OpenRouter returned no response body"
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

        const response =
            await fetch(
                "https://openrouter.ai/api/v1/models",
                {
                    headers: {
                        "Authorization":
                            `Bearer ${this.apiKey}`
                    }
                }
            );

        if (!response.ok) {

            throw new Error(
                `OpenRouter models error: ${response.status}`
            );
        }

        const json =
            await response.json();

        return (json.data ?? [])
            .filter(
                (model: any) =>
                    this.isFreeModelId(
                        model.id
                    ) &&
                    Number(
                        model.pricing?.prompt ??
                        1
                    ) === 0 &&
                    Number(
                        model.pricing?.completion ??
                        1
                    ) === 0 &&
                    Number(
                        model.pricing?.request ??
                        0
                    ) === 0 &&
                    Number(
                        model.pricing?.image ??
                        0
                    ) === 0 &&
                    Number(
                        model.pricing?.web_search ??
                        0
                    ) === 0
            )
            .map(
                (model: any) => ({

                    id:
                        model.id,

                    provider:
                        this.id,

                    displayName:
                        model.name ??
                        model.id,

                    contextLength:
                        model.context_length,

                    access:
                        "free",

                    free:
                        true,

                    inputPrice:
                        0,

                    outputPrice:
                        0,

                    toolCalling:
                        model.supported_parameters
                            ?.includes(
                                "tools"
                            ) ??
                        false,

                    vision:
                        model.architecture
                            ?.input_modalities
                            ?.includes(
                                "image"
                            ) ??
                        false
                })
            );
    }

    async health(): Promise<boolean> {

        try {

            const response =
                await fetch(
                    "https://openrouter.ai/api/v1/models",
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
