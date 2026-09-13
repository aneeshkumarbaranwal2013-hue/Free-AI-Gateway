const messagesEl = document.getElementById("messages");
const promptEl = document.getElementById("prompt");
const sendBtn = document.getElementById("sendBtn");
const modelSelect = document.getElementById("modelSelect");
const chatList = document.getElementById("chatList");
const newChatBtn = document.getElementById("newChat");
const composerStatus = document.getElementById("composerStatus");
const modeHint = document.getElementById("modeHint");

let messages = [];
let chats = [];
let currentChatId = null;
let currentMode = "chat";
let busy = false;


/* MODE */

document.querySelectorAll(".mode").forEach(button => {

    button.addEventListener("click", () => {

        document.querySelectorAll(".mode")
            .forEach(x => x.classList.remove("active"));

        button.classList.add("active");

        currentMode = button.dataset.mode;

        if (currentMode === "code") {

            modeHint.textContent =
                "Code Agent mode";

            promptEl.placeholder =
                "Tell the coding agent what to build...";

            showAgentWorkspace();

        } else {

            modeHint.textContent =
                "Chat mode";

            promptEl.placeholder =
                "Ask anything...";

            hideAgentWorkspace();
        }
    });
});


/* CODE AGENT WORKSPACE */

async function showAgentWorkspace() {

    const view =
        document.getElementById("agentView");

    if (!view) {
        console.error(
            "agentView element not found"
        );
        return;
    }

    view.hidden = false;

    if (view.dataset.loaded === "true") {
        return;
    }

    try {

        const response =
            await fetch("/agent/index.html");

        if (!response.ok) {
            throw new Error(
                `Failed to load Code Agent: HTTP ${response.status}`
            );
        }

        const html =
            await response.text();

        view.innerHTML = html;

        if (
            !document.querySelector(
                'script[data-agent-script="true"]'
            )
        ) {

            const script =
                document.createElement("script");

            script.src =
                "/agent/agent.js";

            script.dataset.agentScript =
                "true";

            document.body.appendChild(script);
        }

        view.dataset.loaded = "true";

    } catch (error) {

        console.error(error);

        view.innerHTML = `
            <div style="
                padding:40px;
                color:#ff6b6b;
                font-family:system-ui;
            ">
                <h2>Code Agent failed to load</h2>
                <p>${error.message}</p>
            </div>
        `;
    }
}


function hideAgentWorkspace() {

    const view =
        document.getElementById("agentView");

    if (view) {
        view.hidden = true;
    }
}


/* MODELS */

async function loadModels() {

    try {

        const response =
            await fetch("/v1/models");

        if (!response.ok)
            throw new Error("Could not load models");

        const json =
            await response.json();

        const models =
            (json.data || []).filter(model => {

                if (model.access === "browser")
                    return true;

                return model.free === true;
            });

        modelSelect.innerHTML = "";

        for (const model of models) {

            const option =
                document.createElement("option");

            option.value = model.id;

            option.textContent =
                model.displayName
                    ? `${model.displayName} — ${model.id}`
                    : model.id;

            modelSelect.appendChild(option);
        }

        if (models.length === 0) {

            const option =
                document.createElement("option");

            option.textContent =
                "No free models available";

            modelSelect.appendChild(option);
        }

    } catch (error) {

        modelSelect.innerHTML =
            `<option>Gateway unavailable</option>`;

        console.error(error);
    }
}


/* CHAT LIST */

function renderChatList() {

    chatList.innerHTML = "";

    chats.forEach(chat => {

        const item =
            document.createElement("div");

        item.className =
            "chat-item" +
            (chat.id === currentChatId
                ? " active"
                : "");

        item.textContent =
            chat.title || "New Chat";

        item.onclick = () => {

            currentChatId = chat.id;

            messages =
                chat.messages || [];

            renderMessages();
            renderChatList();
        };

        chatList.appendChild(item);
    });
}

function saveCurrentChat() {

    if (messages.length === 0)
        return;

    const firstUser =
        messages.find(x => x.role === "user");

    const title =
        firstUser?.content
            ?.slice(0, 35) ||
        "New Chat";

    /* Existing chat: update it */
    if (currentChatId !== null) {

        const chat =
            chats.find(
                x => x.id === currentChatId
            );

        if (chat) {

            chat.messages = [...messages];
            chat.title = title;

            renderChatList();
            return;
        }
    }

    /* No current chat: create one */
    const chat = {
        id:
            `${Date.now()}-${Math.random()
                .toString(36)
                .slice(2)}`,

        title,
        messages: [...messages]
    };

    currentChatId = chat.id;

    chats.unshift(chat);

    chats =
        chats.slice(0, 30);

    renderChatList();
}

/* MESSAGES */

function clearWelcome() {

    const welcome =
        messagesEl.querySelector(".welcome");

    if (welcome)
        welcome.remove();
}


function addMessage(role, text) {

    clearWelcome();

    const wrapper =
        document.createElement("div");

    wrapper.className =
        `message ${role}`;

    const inner =
        document.createElement("div");

    if (role === "assistant") {

        inner.innerHTML =
            `<div class="message-label">AI</div>`;

    } else {

        inner.innerHTML =
            `<div class="message-label">YOU</div>`;
    }

    const bubble =
        document.createElement("div");

    bubble.className =
        "bubble";

    bubble.textContent =
        text;

    inner.appendChild(bubble);
    wrapper.appendChild(inner);

    messagesEl.appendChild(wrapper);

    messagesEl.scrollTop =
        messagesEl.scrollHeight;

    return bubble;
}


function renderMessages() {

    messagesEl.innerHTML = "";

    if (messages.length === 0) {

        messagesEl.innerHTML = `
            <div class="welcome">

                <div class="welcome-icon">✦</div>

                <h1>Free AI Workspace</h1>

                <p>
                    Chat with your free AI models or use Code Agent
                    to work on your projects.
                </p>

            </div>
        `;

        return;
    }

    for (const message of messages) {

        addMessage(
            message.role,
            message.content
        );
    }
}


/* SEND */

async function sendMessage() {

    if (busy)
        return;

    const text =
        promptEl.value.trim();

    if (!text)
        return;

    const model =
        modelSelect.value;

    if (!model ||
        model.includes("unavailable")) {

        addMessage(
            "assistant",
            "No AI model is currently available."
        );

        return;
    }

    busy = true;

    sendBtn.disabled = true;

    composerStatus.textContent =
        "Thinking...";

    promptEl.value = "";

    promptEl.style.height = "auto";


    messages.push({
        role: "user",
        content: text
    });

    addMessage("user", text);


    const assistantBubble =
        addMessage(
            "assistant",
            "Thinking..."
        );

    let assistantText = "";

    try {

        const response =
            await fetch(
                "/v1/chat/completions",
                {
                    method: "POST",

                    headers: {
                        "Content-Type":
                            "application/json"
                    },

                    body: JSON.stringify({
                        model,
                        messages,
                        stream: true
                    })
                }
            );


        if (!response.ok) {

            const errorText =
                await response.text();

            throw new Error(
                errorText ||
                `HTTP ${response.status}`
            );
        }


        const contentType =
            response.headers
                .get("content-type") || "";


        /* SSE STREAM */

        if (
            contentType.includes(
                "text/event-stream"
            )
        ) {

            const reader =
                response.body.getReader();

            const decoder =
                new TextDecoder();

            let buffer = "";

            assistantBubble.textContent = "";

            while (true) {

                const {
                    value,
                    done
                } =
                    await reader.read();

                if (done)
                    break;

                buffer +=
                    decoder.decode(
                        value,
                        { stream: true }
                    );

                const lines =
                    buffer.split("\n");

                buffer =
                    lines.pop() || "";

                for (const line of lines) {

                    if (!line.startsWith("data:"))
                        continue;

                    const raw =
                        line.slice(5).trim();

                    if (!raw ||
                        raw === "[DONE]")
                        continue;

                    try {

                        const chunk =
                            JSON.parse(raw);

                        const text =
                            chunk.text ??
                            chunk.choices?.[0]
                                ?.delta?.content ??
                            chunk.choices?.[0]
                                ?.message?.content ??
                            "";

                        if (text) {

                            assistantText += text;

                            assistantBubble.textContent =
                                assistantText;

                            messagesEl.scrollTop =
                                messagesEl.scrollHeight;
                        }

                    } catch {
                        // Ignore malformed SSE chunks.
                    }
                }
            }


        } else {

            /* NORMAL JSON RESPONSE */

            const json =
                await response.json();

            assistantText =
                json.choices?.[0]
                    ?.message?.content ??
                json.text ??
                "";

            assistantBubble.textContent =
                assistantText;
        }


        if (!assistantText)
            assistantText =
                "The model returned an empty response.";


        messages.push({
            role: "assistant",
            content: assistantText
        });


        saveCurrentChat();

    } catch (error) {

        assistantBubble.textContent =
            `Error: ${error.message}`;

        console.error(error);

    } finally {

        busy = false;

        sendBtn.disabled = false;

        composerStatus.textContent =
            "Ready";

        promptEl.focus();
    }
}


/* SEND BUTTON */

sendBtn.addEventListener(
    "click",
    sendMessage
);


/* ENTER */

promptEl.addEventListener(
    "keydown",
    event => {

        if (
            event.key === "Enter" &&
            !event.shiftKey
        ) {

            event.preventDefault();

            sendMessage();
        }
    }
);


/* AUTO RESIZE */

promptEl.addEventListener(
    "input",
    () => {

        promptEl.style.height =
            "auto";

        promptEl.style.height =
            Math.min(
                promptEl.scrollHeight,
                200
            ) + "px";
    }
);


/* NEW CHAT */

newChatBtn.addEventListener(
    "click",
    () => {

        currentChatId = null;

        messages = [];

        renderMessages();
        renderChatList();

        promptEl.focus();
    }
);


/* QUICK ACTIONS */

document.addEventListener(
    "click",
    event => {

        const button =
            event.target.closest(
                ".quick-actions button"
            );

        if (!button)
            return;

        promptEl.value =
            button.dataset.prompt;

        promptEl.focus();
    }
);


/* START */

loadModels();
renderChatList();
renderMessages();
