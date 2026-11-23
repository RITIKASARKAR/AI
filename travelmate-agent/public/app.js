const form = document.getElementById("chatForm");
const input = document.getElementById("messageInput");
const messages = document.getElementById("messages");
const sendButton = document.getElementById("sendButton");
const welcome = document.getElementById("welcome");

let history = [];

function addMessage(role, content) {
  welcome.style.display = "none";
  const wrapper = document.createElement("div");
  wrapper.className = `message ${role}`;
  const bubble = document.createElement("div");
  bubble.className = "bubble";
  bubble.textContent = content;
  if (role === "assistant") {
    const avatar = document.createElement("div");
    avatar.className = "avatar";
    avatar.textContent = "✦";
    wrapper.append(avatar, bubble);
  } else {
    wrapper.append(bubble);
  }
  messages.appendChild(wrapper);
  messages.parentElement.scrollTop = messages.parentElement.scrollHeight;
}

function setLoading(isLoading) {
  sendButton.disabled = isLoading;
  sendButton.textContent = isLoading ? "…" : "↑";
  let loader = document.getElementById("loadingMessage");
  if (isLoading && !loader) {
    loader = document.createElement("div");
    loader.id = "loadingMessage";
    loader.className = "loading";
    loader.textContent = "TravelMate is thinking and checking its tools…";
    messages.appendChild(loader);
  } else if (!isLoading && loader) {
    loader.remove();
  }
}

async function sendMessage(message) {
  addMessage("user", message);
  history.push({ role: "user", content: message });
  setLoading(true);

  try {
    const response = await fetch("/api/plan", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message, history: history.slice(0, -1) })
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Request failed.");

    addMessage("assistant", data.reply);
    history.push({ role: "assistant", content: data.reply });
  } catch (error) {
    addMessage("assistant", `Sorry, I couldn't complete that request. ${error.message}`);
  } finally {
    setLoading(false);
    input.focus();
  }
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const message = input.value.trim();
  if (!message || sendButton.disabled) return;
  input.value = "";
  await sendMessage(message);
});

input.addEventListener("keydown", (event) => {
  if (event.key === "Enter" && !event.shiftKey) {
    event.preventDefault();
    form.requestSubmit();
  }
});

document.querySelectorAll(".suggestion").forEach((button) => {
  button.addEventListener("click", () => {
    input.value = button.textContent;
    form.requestSubmit();
  });
});
