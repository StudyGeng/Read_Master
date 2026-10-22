import { getFirebaseAIContext } from "./firebase-service.js";

let modelPromise;

async function getModel() {
  if (!modelPromise) {
    modelPromise = getFirebaseAIContext().then(async ({ app, sdkVersion }) => {
      const aiModule = await import(`https://www.gstatic.com/firebasejs/${sdkVersion}/firebase-ai.js`);
      const ai = aiModule.getAI(app, { backend: new aiModule.GoogleAIBackend() });
      return aiModule.getGenerativeModel(ai, { model: "gemini-3.5-flash-lite" });
    }).catch((error) => {
      modelPromise = null;
      throw error;
    });
  }
  return modelPromise;
}

export async function askGemini(prompt) {
  const model = await getModel();
  let timeoutId;
  const timeout = new Promise((_, reject) => {
    timeoutId = setTimeout(() => reject(new Error("Gemini took too long to respond.")), 25000);
  });
  const result = await Promise.race([model.generateContent(prompt), timeout])
    .finally(() => clearTimeout(timeoutId));
  const answer = result.response.text().trim().slice(0, 1200);
  if (!answer) throw new Error("Gemini returned an empty answer.");
  return answer;
}
