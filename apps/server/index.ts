import { readFile } from "node:fs/promises";
import { join } from "node:path";
import "dotenv/config";

import Fastify from "fastify";

import { OpenRouterProvider } from "../../packages/providers/openrouter";
import { OpenAICompatibleProvider } from "../../packages/providers/openai-compatible";
import { BrowserChatGPTProvider } from "../../packages/providers/browser-chatgpt";
import { BrowserClaudeProvider } from "../../packages/providers/browser-claude";
import { NvidiaNimProvider } from "../../packages/providers/nvidia-nim";
import { GroqProvider } from "../../packages/providers/groq";

import type { AIProvider } from "../../packages/core/types";
import { AIRouter } from "../../packages/core/router";
import type {
    ToolDefinition,
    Message
} from "../../packages/core/types";


const app = Fastify({
    logger: true
});

const providers: AIProvider[] = [];

// OpenRouter — only explicitly FREE models are accepted by the router.
const openrouter =
    process.env.OPENROUTER_API_KEY
        ? new OpenRouterProvider()
        : null;

if (openrouter) {
    providers.push(openrouter);
}

// Browser ChatGPT — local browser session, no API key.
const browserChatGPT =
    process.env.BROWSER_BRIDGE_TOKEN
        ? new BrowserChatGPTProvider()
        : null;

if (browserChatGPT) {
    providers.push(browserChatGPT);
}

// Browser Claude — local persistent Chromium session.
const browserClaude =
    process.env.BROWSER_BRIDGE_TOKEN
        ? new BrowserClaudeProvider()
        : null;

if (browserClaude) {
    providers.push(browserClaude);
}

// NVIDIA — only allowlisted free endpoints.
const nvidia =
    process.env.NVIDIA_API_KEY
        ? new NvidiaNimProvider()
        : null;

if (nvidia) {
    providers.push(nvidia);
}

// Groq provider.
const groqProvider =
    process.env.GROQ_API_KEY
        ? new GroqProvider()
        : null;

if (groqProvider) {
    providers.push(groqProvider);
}

if (providers.length === 0) {
    throw new Error(
        "No AI providers configured. Set at least one provider."
    );
}

const router =
    new AIRouter(providers);







/* ============================================================
   REAL CODE AGENT TOOL LOOP
   ============================================================ */

const AGENT_TOOLS: ToolDefinition[] = [

    {
        type: "function",

        function: {
            name: "list_files",

            description:
                "List files in the user's project.",

            parameters: {
                type: "object",

                properties: {
                    directory: {
                        type: "string",
                        description:
                            "Directory relative to the project root. Defaults to ."
                    }
                }
            }
        }
    },

    {
        type: "function",

        function: {
            name: "read_file",

            description:
                "Read a text file from the project.",

            parameters: {
                type: "object",

                properties: {
                    path: {
                        type: "string",
                        description:
                            "Relative path of the file."
                    }
                },

                required: ["path"]
            }
        }
    },

    {
        type: "function",

        function: {
            name: "search_code",

            description:
                "Search the project source code for a string.",

            parameters: {
                type: "object",

                properties: {
                    query: {
                        type: "string",
                        description:
                            "Text to search for."
                    }
                },

                required: ["query"]
            }
        }
    },

    {
        type: "function",

        function: {
            name: "write_file",

            description:
                "Create or completely replace a project file.",

            parameters: {
                type: "object",

                properties: {
                    path: {
                        type: "string"
                    },

                    content: {
                        type: "string"
                    }
                },

                required: [
                    "path",
                    "content"
                ]
            }
        }
    },

    {
        type: "function",

        function: {
            name: "edit_file",

            description:
                "Replace an exact piece of text inside an existing file.",

            parameters: {
                type: "object",

                properties: {
                    path: {
                        type: "string"
                    },

                    oldText: {
                        type: "string"
                    },

                    newText: {
                        type: "string"
                    }
                },

                required: [
                    "path",
                    "oldText",
                    "newText"
                ]
            }
        }
    },

    {
        type: "function",

        function: {
            name: "run_command",

            description:
                "Run a shell command inside the project directory.",

            parameters: {
                type: "object",

                properties: {
                    command: {
                        type: "string"
                    }
                },

                required: ["command"]
            }
        }
    }
];



app.get("/v1/models", async () => {
    const models =
        await router.listModels();

    return {
        object: "list",
        data: models
    };
});

app.post(
    "/v1/chat/completions",
    async (request, reply) => {
        const body =
            request.body as any;

        if (
            !body.model ||
            !body.messages
        ) {
            return reply
                .code(400)
                .send({
                    error:
                        "model and messages are required"
                });
        }

        const stream =
            body.stream === true;

        const chatRequest = {
            model: body.model,
            messages: body.messages,
            stream
        };

        if (!stream) {
            let content = "";

            for await (
                const chunk of
                router.chat(chatRequest)
            ) {
                if (chunk.type === "text") {
                    content += chunk.text;
                }
            }

            return {
                id: "chat-completion",
                object: "chat.completion",
                choices: [
                    {
                        index: 0,
                        message: {
                            role: "assistant",
                            content
                        },
                        finish_reason: "stop"
                    }
                ]
            };
        }

        reply.raw.writeHead(
            200,
            {
                "Content-Type":
                    "text/event-stream",
                "Cache-Control":
                    "no-cache",
                "Connection":
                    "keep-alive"
            }
        );

        try {
            for await (
                const chunk of
                router.chat(chatRequest)
            ) {
                if (chunk.type !== "text") {
                    continue;
                }

                reply.raw.write(
                    `data: ${JSON.stringify({
                        choices: [
                            {
                                index: 0,
                                delta: {
                                    content:
                                        chunk.text
                                }
                            }
                        ]
                    })}\n\n`
                );
            }

            reply.raw.write(
                "data: [DONE]\n\n"
            );

        } catch (error) {
            console.error(error);

            reply.raw.write(
                `data: ${JSON.stringify({
                    error:
                        error instanceof Error
                            ? error.message
                            : String(error)
                })}\n\n`
            );
        }

        reply.raw.end();
    }
);

/* Web UI */

const WEB_DIR = join(process.cwd(), "apps/web");

app.get("/", async (_request, reply) => {
    const html = await readFile(
        join(WEB_DIR, "index.html"),
        "utf8"
    );

    return reply
        .type("text/html")
        .send(html);
});

app.get("/app.js", async (_request, reply) => {
    const js = await readFile(
        join(WEB_DIR, "app.js"),
        "utf8"
    );

    return reply
        .type("application/javascript")
        .send(js);
});

app.get("/style.css", async (_request, reply) => {
    const css = await readFile(
        join(WEB_DIR, "style.css"),
        "utf8"
    );

    return reply
        .type("text/css")
        .send(css);
});

app.listen({
    port: 8080,
    host: "127.0.0.1"
}).then(() => {
    console.log(
        "🚀 FreeAI Gateway running at http://127.0.0.1:8080"
    );

    console.log(
        "Providers:",
        providers
            .map(provider => provider.id)
            .join(", ")
    );
});
