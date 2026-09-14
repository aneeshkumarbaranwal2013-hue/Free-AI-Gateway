# Free AI Gateway

An open-source, free-first AI chatbot gateway designed to provide a unified
interface for multiple AI providers.

The project is intended to be easy to fork, modify, and improve.

---

## ✨ Features

- 🤖 Multi-provider AI chatbot
- 🔄 Automatic model/provider routing
- ⚡ Streaming responses
- 🆓 Free-model support
- 🔌 OpenAI-compatible API
- 🌐 Local web interface
- 🐧 Linux support
- 🪟 Windows support
- 🍎 macOS support
- 🧩 Designed to be extended by other developers

---

# 📦 Installation

## Requirements

You need:

- Node.js 20 or newer
- npm
- Git

Check whether they are installed:

node --version
npm --version
git --version

Windows Installation
1. Install Node.js

Download Node.js from:

https://nodejs.org/

Install the LTS version.

Open PowerShell and verify:

node --version
npm --version
2. Install Git

Download Git from:

https://git-scm.com/downloads

Verify:

git --version
3. Clone the repository
git clone https://github.com/YOUR_USERNAME/free-ai-gateway.git
cd free-ai-gateway

Replace YOUR_USERNAME with the GitHub account that owns the repository.

4. Install dependencies
npm install
5. Configure environment variables

Create .env file with:

env contents from example mention in the last 5-6 lines.

Open it:

notepad .env

Add the API keys for the providers you want to use.

Never publish your .env file.

6. Start the gateway
npm run server

7. To configure web AIs like claude and gpt models: (optional but good cuz gpt and claude models are op)
first set your BROWSER_BRIDGE_TOKEN in .env.
   for chatgpt:
   get an extension like cookie extractor.
   go to chatgpt.com
   make sure you are logged in.
   export cookies to json from cookie extractor
   make a new file in the folder called cookies.json
   paste the exported json content
   run: npm run browser:chatgpt

   for claude: (make sure you have chromium installed)
   run: npm run browser:claude
   it will open chromium
   so login there do not use cookies or cloudfare security will make it stuck in an infinite loop
   
The gateway should start locally.

Open the address shown by the terminal in your browser.

🐧 Linux Installation

On Debian/Ubuntu:

sudo apt update
sudo apt install git

Install Node.js 20+ if it isn't already installed.

Then:

git clone https://github.com/YOUR_USERNAME/free-ai-gateway.git
cd free-ai-gateway
npm install

Create the environment file:

make .env file mentioned as example in the last of readme.md

To configure web AIs like claude and gpt models:

same as windows

Edit it:

nano .env

Start the gateway:

npm run server

🍎 macOS Installation

Install Git and Node.js.

Then:

git clone https://github.com/YOUR_USERNAME/free-ai-gateway.git
cd free-ai-gateway
npm install

Create the environment file:

make .env file mentioned as example in the last of readme.md

To configure web AIs like claude and gpt models:

same as windows

Edit it:

nano .env

Start:

npm run server
🔑 Provider Configuration

The gateway can use different AI providers depending on which credentials
you configure.

Example .env:

OPENROUTER_API_KEY=

NVIDIA_API_KEY=

GROQ_API_KEY=

BROWSER_BRIDGE_TOKEN=

Leave providers blank if you don't want to use them.

NOTE- THIS WAS VIBE CODED BY CHATGPT IDK WHAT IS CODING if u know how to code u can improve this idc. Also you might see a coding environment in the UI (localhost:8080) but it will say that some files are not found as i tried to implement it but it failed so some of the leftovers are still there.
