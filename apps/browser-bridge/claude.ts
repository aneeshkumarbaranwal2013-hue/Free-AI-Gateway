import Fastify from "fastify";
import { chromium, type BrowserContext, type Page } from "playwright";
import * as path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = Fastify({ logger: true });

const HOST = "127.0.0.1";
const PORT = Number(process.env.CLAUDE_BRIDGE_PORT ?? 8766);

const TOKEN =
    process.env.BROWSER_BRIDGE_TOKEN ??
    "change-this-local-token";

const PROFILE =
    process.env.CLAUDE_BROWSER_PROFILE ??
    `${process.env.HOME}/.free-ai-gateway/browser-profiles/claude-chromium`;

const CLAUDE_URL =
    process.env.CLAUDE_URL ??
    "https://claude.ai";

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
    if (!header?.startsWith("Bearer ")) return false;
    return header.slice("Bearer ".length) === TOKEN;
}

async function launchBrowser(): Promise<void> {
    if (context && page) return;

    console.log("\n========================================");
    console.log(" Claude AI Auto-Launch Browser Bridge");
    console.log("========================================");
    console.log(`Profile: ${PROFILE}`);

    try {
        console.log("Automatically launching native system Chromium...");
        
        // This forces Playwright to spin up your real unmanaged system Chromium
        context = await chromium.launchPersistentContext(PROFILE, {
            executablePath: "/usr/bin/chromium", 
            headless: false,
            viewport: { width: 1366, height: 768 },
            // Emulate native browser flags to keep Cloudflare happy
            args: [
                "--password-store=basic",
                "--no-sandbox",
                "--disable-blink-features=AutomationControlled"
            ],
            ignoreDefaultArgs: ["--enable-automation"]
        });

        // Strip leftover internal property flags
        await context.addInitScript(() => {
            Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
        });

        const pages = context.pages();
        page = pages.length > 0 ? pages[0] : await context.newPage();

        console.log("Navigating to Claude...");
        await page.goto(CLAUDE_URL, { waitUntil: "domcontentloaded", timeout: 60000 });

        console.log("\n✅ Native browser spawned and connected on autopilot.");
        console.log(`Active Page: ${page.url()}`);
    } catch (err: any) {
        console.error("\n❌ Failed to automatically launch Chromium browser!");
        console.error(`Details: ${err.message}\n`);
        process.exit(1);
    }
}

async function findComposer(currentPage: Page) {
    const selectors = ['textarea[placeholder*="Message"]', 'textarea', '[contenteditable="true"]', '[role="textbox"]'];
    for (const selector of selectors) {
        const locator = currentPage.locator(selector).first();
        try {
            await locator.waitFor({ state: "visible", timeout: 5000 });
            return locator;
        } catch {}
    }
    throw new Error("Could not find the Claude message composer.");
}

async function submitPrompt(
    currentPage: Page,
    prompt: string
): Promise<void> {
    const composer =
        await findComposer(currentPage);

    await composer.click();

    await composer.fill(prompt);

    // Give Claude's frontend time to register the input.
    await currentPage.waitForTimeout(300);

    const sendSelectors = [
        'button[aria-label*="Send"]',
        'button[aria-label*="send"]',
        'button[data-testid*="send"]',
        'button[type="submit"]'
    ];

    for (const selector of sendSelectors) {
        const button =
            currentPage.locator(selector).last();

        try {
            await button.waitFor({
                state: "visible",
                timeout: 1500
            });

            const disabled =
                await button.isDisabled().catch(
                    () => false
                );

            if (!disabled) {
                await button.click();
                return;
            }
        } catch {
            // Try the next selector.
        }
    }

    // Fallback if Claude's send button isn't found.
    await composer.press("Enter");
}

async function getAssistantMessages(currentPage: Page) {
    const selectors = ['[data-is-streaming="false"]', '[data-testid*="assistant"]', '[class*="prose"]'];
    for (const selector of selectors) {
        const locator = currentPage.locator(selector);
        try {
            const count = await locator.count();
            if (count > 0) return locator;
        } catch {}
    }
    return currentPage.locator('[class*="prose"]');
}

async function waitForResponse(currentPage: Page, previousText: string): Promise<string> {
    const timeout = Date.now() + 120000;
    let lastText = "";
    let stableSince = 0;

    while (Date.now() < timeout) {
        try {
            const messages = await getAssistantMessages(currentPage);
            const count = await messages.count();
            if (count > 0) {
                const latest = messages.last();
                const text = (await latest.innerText()).trim();
                if (text && text !== previousText) {
                    if (text !== lastText) {
                        lastText = text;
                        stableSince = Date.now();
                    } else if (Date.now() - stableSince >= 1800) {
                        return text;
                    }
                }
            }
        } catch {}
        await currentPage.waitForTimeout(300);
    }
    if (lastText) return lastText;
    throw new Error("Timed out waiting for Claude response.");
}

async function getLatestAssistantText(currentPage: Page): Promise<string> {
    try {
        const messages = await getAssistantMessages(currentPage);
        const count = await messages.count();
        if (count === 0) return "";
        return (await messages.last().innerText()).trim();
    } catch { return ""; }
}

app.get("/health", async () => {
    return { ok: true, browser: Boolean(context), page: Boolean(page), busy };
});

app.post<{ Body: ChatRequest }>("/v1/chat/completions", async (request, reply) => {
    if (!authorized(request)) return reply.code(401).send({ error: "Unauthorized" });
    if (busy) return reply.code(429).send({ error: "Claude browser provider is currently busy" });

    const messages = request.body?.messages ?? [];
    if (messages.length === 0) return reply.code(400).send({ error: "messages must not be empty" });

    const userMessages = messages.filter(m => m.role === "user").map(m => m.content);
    if (userMessages.length === 0) return reply.code(400).send({ error: "At least one user message is required" });
    if (!context || !page) return reply.code(503).send({ error: "Browser is not ready" });

    const prompt = userMessages.join("\n\n");
    busy = true;

    try {
        const currentPage = page;
        const previousText = await getLatestAssistantText(currentPage);
        await submitPrompt(currentPage, prompt);
        const response = await waitForResponse(currentPage, previousText);

        return {
            id: `browser-${Date.now()}`,
            object: "chat.completion",
            model: "browser/claude",
            choices: [{ index: 0, message: { role: "assistant", content: response }, finish_reason: "stop" }]
        };
    } catch (error: any) {
        return reply.code(500).send({ error: error.message });
    } finally {
        busy = false;
    }
});

async function shutdown() {
    try { if (context) await context.close(); } finally { process.exit(0); }
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

async function main() {
    try {
        await app.listen({ host: HOST, port: PORT });
        console.log(`Browser bridge listening on http://${HOST}:${PORT}`);
        await launchBrowser();
    } catch (error) {
        await shutdown();
    }
}
main();
