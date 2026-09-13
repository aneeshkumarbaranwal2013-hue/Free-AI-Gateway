import Fastify from "fastify";
import { firefox, type BrowserContext, type Page } from "playwright";
import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = Fastify({ logger: true });

const HOST = "127.0.0.1";
const PORT = Number(process.env.BROWSER_BRIDGE_PORT ?? 8765);

const TOKEN =
    process.env.BROWSER_BRIDGE_TOKEN ??
    "change-this-local-token";

const PROFILE =
    process.env.BROWSER_PROFILE ??
    `${process.env.HOME}/.free-ai-gateway/browser-profiles/chatgpt-firefox`;

const CHATGPT_URL =
    process.env.CHATGPT_URL ??
    "https://chatgpt.com";

let context: BrowserContext | null = null;
let page: Page | null = null;
let busy = false;

interface ChatMessage {
    role: "system" | "user" | "assistant";
    content: string;
}

interface ChatRequest {
    messages: ChatMessage[];
}

function authorized(request: any): boolean {
    const header = request.headers.authorization;

    if (!header?.startsWith("Bearer ")) {
        return false;
    }

    return header.slice("Bearer ".length) === TOKEN;
}

async function launchBrowser(): Promise<void> {
    if (context && page) {
        return;
    }

    console.log("");
    console.log("========================================");
    console.log(" Firefox AI Browser Bridge");
    console.log("========================================");
    console.log(`Profile: ${PROFILE}`);
    console.log("");

    console.log("Launching dedicated Firefox profile...");

    context = await firefox.launchPersistentContext(PROFILE, {
        headless: true,
        viewport: {
            width: 1280,
            height: 900
        }
    });

    const cookiesPath = path.resolve(__dirname, "../../cookies.json");

    if (fs.existsSync(cookiesPath)) {
        try {
            console.log(`Found cookies.json at: ${cookiesPath}`);
            const cookiesRaw = fs.readFileSync(cookiesPath, "utf8");
            let cookies = JSON.parse(cookiesRaw);
            
            cookies = cookies.map((cookie: any) => {
                if (cookie.sameSite) {
                    const normalized = cookie.sameSite.toLowerCase();
                    if (normalized === "strict") cookie.sameSite = "Strict";
                    else if (normalized === "lax") cookie.sameSite = "Lax";
                    else if (normalized === "none") cookie.sameSite = "None";
                    else delete cookie.sameSite;
                } else {
                    delete cookie.sameSite;
                }

                if (cookie.partitionKey !== undefined) {
                    delete cookie.partitionKey;
                }
                
                return cookie;
            });
            
            await context.addCookies(cookies);
            console.log("✅ Session cookies sanitized and injected successfully.");
        } catch (err: any) {
            console.error("❌ Failed to parse or inject cookies.json:", err.message);
        }
    } else {
        console.log(`ℹ️ No cookies.json found at: ${cookiesPath}. Using raw profile.`);
    }

    const pages = context.pages();

    page =
        pages.length > 0
            ? pages[0]
            : await context.newPage();

    console.log("Opening ChatGPT...");

    await page.goto(CHATGPT_URL, {
        waitUntil: "domcontentloaded",
        timeout: 60000
    });

    try {
        console.log("Refreshing page context to load cookies...");
        await page.reload({ waitUntil: "domcontentloaded" });
    } catch (e) {}

    console.log("");
    console.log("Firefox is ready.");
    console.log(`Page: ${page.url()}`);
    console.log("");
    console.log("If ChatGPT asks you to log in, do it manually");
    console.log("in this dedicated Firefox profile.");
    console.log("");
}

async function findComposer(currentPage: Page) {
    const selectors = [
        'textarea[placeholder*="Message"]',
        'textarea',
        '[contenteditable="true"]'
    ];

    for (const selector of selectors) {
        const locator = currentPage
            .locator(selector)
            .first();

        try {
            await locator.waitFor({
                state: "visible",
                timeout: 5000
            });

            return locator;
        } catch {
            // Try next selector.
        }
    }

    throw new Error(
        "Could not find the ChatGPT message composer."
    );
}
async function submitPrompt(
    currentPage: Page,
    prompt: string
): Promise<void> {
    const composer =
        await findComposer(currentPage);

    await composer.click();

    await composer.fill(prompt);

    await composer.press("Enter");
}

async function waitForResponse(
    currentPage: Page,
    previousCount: number
): Promise<string> {
    const timeout =
        Date.now() + 120000;

    let lastText = "";
    let stableSince = 0;

    while (Date.now() < timeout) {
        const candidates =
            currentPage.locator(
                '[data-message-author-role="assistant"]'
            );

        const count =
            await candidates.count();

        if (count > previousCount) {
            const latest =
                candidates.last();

            const text =
                (await latest.innerText()).trim();

            if (text) {
                if (text !== lastText) {
                    lastText = text;
                    stableSince = Date.now();
                } else if (
                    Date.now() - stableSince >= 1500
                ) {
                    return text;
                }
            }
        }

        await currentPage.waitForTimeout(250);
    }

    if (lastText) {
        return lastText;
    }

    throw new Error(
        "Timed out waiting for ChatGPT response."
    );
}

app.get("/health", async () => {
    return {
        ok: true,
        browser: Boolean(context),
        page: Boolean(page),
        busy
    };
});

app.post<{
    Body: ChatRequest;
}>(
    "/v1/chat/completions",
    async (request, reply) => {
        if (!authorized(request)) {
            return reply.code(401).send({
                error: "Unauthorized"
            });
        }

        if (busy) {
            return reply.code(429).send({
                error:
                    "Browser provider is currently busy"
            });
        }

        const messages =
            request.body?.messages ?? [];

        if (messages.length === 0) {
            return reply.code(400).send({
                error:
                    "messages must not be empty"
            });
        }

        const userMessages =
            messages
                .filter(
                    message =>
                        message.role === "user"
                )
                .map(
                    message =>
                        message.content
                );

        if (userMessages.length === 0) {
            return reply.code(400).send({
                error:
                    "At least one user message is required"
            });
        }

        if (!context || !page) {
            return reply.code(503).send({
                error:
                    "Browser is not ready"
            });
        }

        const prompt =
            userMessages.join("\n\n");

        busy = true;

        try {
            const currentPage = page;

            const existing =
                currentPage.locator(
                    '[data-message-author-role="assistant"]'
                );

            const previousCount =
                await existing.count();

            await submitPrompt(
                currentPage,
                prompt
            );

            const response =
                await waitForResponse(
                    currentPage,
                    previousCount
                );

            return {
                id:
                    `browser-${Date.now()}`,

                object:
                    "chat.completion",

                model:
                    "browser/chatgpt",

                choices: [
                    {
                        index: 0,

                        message: {
                            role: "assistant",
                            content: response
                        },

                        finish_reason:
                            "stop"
                    }
                ]
            };
        } catch (error) {
            request.log.error(error);

            return reply.code(500).send({
                error:
                    error instanceof Error
                        ? error.message
                        : String(error)
            });
        } finally {
            busy = false;
        }
    }
);

async function shutdown() {
    console.log(
        "\nShutting down Firefox bridge..."
    );

    try {
        if (context) {
            await context.close();
        }
    } finally {
        process.exit(0);
    }
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

async function main() {
    try {
        await app.listen({
            host: HOST,
            port: PORT
        });

        console.log(
            `Browser bridge listening on http://${HOST}:${PORT}`
        );

        await launchBrowser();

        console.log(
            "Browser bridge ready."
        );
    } catch (error) {
        console.error(
            "Failed to start browser bridge:",
            error
        );

        await shutdown();
    }
}

main();
