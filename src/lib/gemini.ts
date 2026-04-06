import { GoogleGenerativeAI } from "@google/generative-ai";

const genAI = new GoogleGenerativeAI(process.env.GOOGLE_GENAI_API_KEY || "");

export async function extractBookInfoFromImages(imageUrls: string[]) {
  if (!process.env.GOOGLE_GENAI_API_KEY) {
    throw new Error("Gemini API Key is missing. Please set GOOGLE_GENAI_API_KEY in .env.local");
  }

  const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

  // Convert image URLs to the format Gemini expects
  // Note: In a real production environment, we should fetch the images and convert to base64
  // since Gemini API requires either file upload or base64 inline data.
  
  const prompt = `
    Attached are images from a library or a book tree (북트리).
    Please identify all the book titles shown in these images.
    
    Categorize them into 'korean' and 'english' based on the language of the title.
    Provide the result in the following JSON format ONLY:
    {
      "koreanBooks": "Title 1\\nTitle 2",
      "koreanCount": 2,
      "englishBooks": "Title A\\nTitle B",
      "englishCount": 2
    }
    If no books are found, return 0 for counts and empty strings for titles.
    Do not add any other text outside the JSON.
  `;

  try {
    // For simplicity in this demo/agentic flow, we'll assume we can fetch and pass them.
    // In actual implementation, we fetch each URL and pass as { inlineData: { data: base64, mimeType: "image/jpeg" } }
    
    // Placeholder for asynchronous image processing
    const results = await Promise.all(imageUrls.map(async (url) => {
      const resp = await fetch(url);
      const buffer = await resp.arrayBuffer();
      return {
        inlineData: {
          data: Buffer.from(buffer).toString("base64"),
          mimeType: "image/jpeg",
        },
      };
    }));

    const result = await model.generateContent([prompt, ...results]);
    const response = await result.response;
    const text = response.text();
    
    // Extract JSON from the response text (cleaning up markdown if present)
    const jsonStr = text.replace(/```json|```/g, "").trim();
    return JSON.parse(jsonStr);
    
  } catch (error) {
    console.error("Gemini analysis error:", error);
    throw error;
  }
}
