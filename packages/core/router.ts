import type {
    AIProvider,
    ChatRequest,
    ChatChunk,
    Model
} from "./types";

export class AIRouter {
    private providers: AIProvider[];

    constructor(providers: AIProvider[]) {
        this.providers = providers;
    }

    async listModels(): Promise<Model[]> {
        const models: Model[] = [];

        for (const provider of this.providers) {
            try {
                const providerModels =
                    await provider.listModels();

                models.push(...providerModels);
            } catch (error) {
                console.error(
                    `Failed to list models from ${provider.id}:`,
                    error
                );
            }
        }

        return models;
    }

    private isFreeModel(model: Model): boolean {
        if (model.provider === "openrouter") {
            return (
                model.id === "openrouter/free" ||
                model.id.endsWith(":free")
            );
        }

        if (
            model.provider === "nvidia" ||
            model.provider === "groq"
        ) {
            return (
                model.access === "free" &&
                model.free === true
            );
        }

        if (
            model.provider === "browser-chatgpt" ||
            model.provider === "browser-claude"
        ) {
            return (
                model.access === "browser" &&
                model.free === true
            );
        }

        return false;
    }

    async *chat(
        request: ChatRequest
    ): AsyncIterable<ChatChunk> {
        const models =
            await this.listModels();

        const model =
            models.find(
                m => m.id === request.model
            );

        if (!model) {
            throw new Error(
                `Model "${request.model}" is not available`
            );
        }

        if (!this.isFreeModel(model)) {
            throw new Error(
                `Model "${request.model}" is not available as a FREE model`
            );
        }

        const provider =
            this.providers.find(
                p => p.id === model.provider
            );

        if (!provider) {
            throw new Error(
                `Provider "${model.provider}" is not available`
            );
        }

        yield* provider.chat(request);
    }
}
