export interface Message {
    role: "system" | "user" | "assistant" | "tool";
    content: string;

    tool_calls?: ToolCallMessage[];

    tool_call_id?: string;
}

export interface ToolCallMessage {
    id: string;

    type: "function";

    function: {
        name: string;
        arguments: string;
    };
}

export interface ToolDefinition {
    type: "function";

    function: {
        name: string;
        description: string;

        parameters: {
            type: "object";

            properties: Record<
                string,
                unknown
            >;

            required?: string[];
        };
    };
}

export interface ChatRequest {
    model: string;
    messages: Message[];
    stream?: boolean;

    tools?: ToolDefinition[];

    tool_choice?: "auto" | "none";
}

export type ChatChunk =
    | {
        type: "text";
        text: string;
    }
    | {
        type: "tool_call";
        id: string;
        name: string;
        arguments: string;
    };

export type AccessType =
    | "free"
    | "api-key"
    | "local"
    | "browser";

export interface Model {
    id: string;
    provider: string;
    displayName: string;
    contextLength?: number;

    access: AccessType;

    free: boolean;
    inputPrice?: number;
    outputPrice?: number;

    toolCalling?: boolean;
    vision?: boolean;
}

export interface AIProvider {
    id: string;

    chat(
        request: ChatRequest
    ): AsyncIterable<ChatChunk>;

    listModels(): Promise<Model[]>;

    health(): Promise<boolean>;
}
