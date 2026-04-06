import { GoogleGenerativeAI } from "@google/generative-ai";
import * as dotenv from "dotenv";
import path from "path";

dotenv.config({ path: path.resolve('C:/Users/KBS/Coding/eunsostudy/reading-log/.env.local') });

const genAI = new GoogleGenerativeAI(process.env.GOOGLE_GENAI_API_KEY || "");

async function listModels() {
  try {
    // Note: listModels is not directly on genAI in older versions, 
    // but in newer ones it might be.
    // Actually, we can just try to fetch the list via REST if needed.
    // But let's try the library's way if it exists.
    const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${process.env.GOOGLE_GENAI_API_KEY}`;
    const response = await fetch(url);
    const data = await response.json();
    console.log("AVAILABLE MODELS:");
    if (data.models) {
      data.models.forEach((m: any) => console.log(`- ${m.name}`));
    } else {
      console.log(JSON.stringify(data, null, 2));
    }
  } catch (err) {
    console.error(err);
  }
}

listModels();
