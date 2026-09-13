#!/usr/bin/env node

const GATEWAY =
    process.env.FREEAI_GATEWAY ||
    "http://127.0.0.1:8080";

const args = process.argv.slice(2);

function printHelp() {
    console.log(`
FreeAI CLI

Usage:
  freeai "your prompt"
  freeai --model MODEL "your prompt"
  freeai --models
  freeai --help

Options:
  --model MODEL    Use a specific model
  --models         List available models
  --help           Show this help

Environment:
  FREEAI_GATEWAY   Gateway URL
                   Default: http://127.0.0.1:8080
`);
}

async function getModels() {
    const response =
        await fetch(`${GATEWAY}/v1/models`);

    if (!response.ok) {
        throw new Error(
            `Gateway returned HTTP ${response.status}`
        );
    }

    const json =
        await response.json();

    return json.data ?? [];
}

async function listModels() {
    const models =
        await getModels();

    if (models.length === 0) {
        console.log(
            "No models are currently available."
        );

        return;
    }

    console.log(
        "\nAvailable FREE models:\n"
    );

    for (const model of models) {
        const context =
            model.contextLength
                ? `${model.contextLength.toLocaleString()} ctx`
                : "unknown ctx";

        const capabilities: string[] = [];

        if (model.toolCalling) {
            capabilities.push("tools");
        }

        if (model.vision) {
            capabilities.push("vision");
        }

        const caps =
            capabilities.length > 0
                ? ` [${capabilities.join(", ")}]`
                : "";

        console.log(
            `  ${model.id} — ${context}${caps}`
        );
    }

    console.log();
}

async function chat(
    prompt: string,
    model: string
) {
    const response =
        await fetch(
            `${GATEWAY}/v1/chat/completions`,
            {
                method: "POST",

                headers: {
                    "Content-Type":
                        "application/json"
                },

                body: JSON.stringify({
                    model,
                    stream: true,

                    messages: [
                        {
                            role: "user",
                            content: prompt
                        }
                    ]
                })
            }
        );

    if (!response.ok) {
        const error =
            await response.text();

        throw new Error(
            `Gateway error ${response.status}: ${error}`
        );
    }

    if (!response.body) {
        throw new Error(
            "Gateway returned no response body"
        );
    }

    const reader =
        response.body.getReader();

    const decoder =
        new TextDecoder();

    let buffer = "";

    process.stdout.write("\n");

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
                line.slice(6);

            if (data === "[DONE]") {
                continue;
            }

            try {
                const json =
                    JSON.parse(data);

                if (json.error) {
                    throw new Error(
                        json.error
                    );
                }

                const text =
                    json.choices?.[0]
                        ?.delta?.content;

                if (text) {
                    process.stdout.write(text);
                }

            } catch (error) {
                if (
                    error instanceof SyntaxError
                ) {
                    continue;
                }

                throw error;
            }
        }
    }

    process.stdout.write("\n\n");
}

async function main() {
    if (
        args.includes("--help") ||
        args.includes("-h")
    ) {
        printHelp();
        return;
    }

    if (args.includes("--models")) {
        await listModels();
        return;
    }

    let model =
        "auto";

    const promptParts: string[] = [];

    for (
        let i = 0;
        i < args.length;
        i++
    ) {
        const arg =
            args[i];

        if (
            arg === "--model" ||
            arg === "-m"
        ) {
            const next =
                args[++i];

            if (!next) {
                throw new Error(
                    "--model requires a model ID"
                );
            }

            model = next;
            continue;
        }

        if (arg) {
            promptParts.push(arg);
        }
    }

    const prompt =
        promptParts.join(" ").trim();

    if (!prompt) {
        printHelp();
        process.exit(1);
    }

    console.log(
        `\n🤖 FreeAI → ${model}\n`
    );

    await chat(
        prompt,
        model
    );
}

main().catch(error => {
    console.error(
        `\n❌ ${
            error instanceof Error
                ? error.message
                : String(error)
        }`
    );

    process.exit(1);
});
