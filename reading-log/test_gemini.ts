import { GoogleGenerativeAI } from "@google/generative-ai";
import * as dotenv from "dotenv";
import path from "path";

dotenv.config({ path: path.resolve('C:/Users/KBS/Coding/eunsostudy/reading-log/.env.local') });

const genAI = new GoogleGenerativeAI(process.env.GOOGLE_GENAI_API_KEY || "");
const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

const content = `한 2, 영 5



집듣 step into reading 2 (2회독,2권)

음독 A dollar for penny (70%)



영상 1시간 (매직스쿨버스)

흘려듣기 1시간 (주제음원)`;

const prompt = `
        다음은 네이버 블로그에서 가져온 북트리(기록장) 내용입니다.
        날짜: 2026-03-21
        
        본문 텍스트:
        ${content || "이미지 위주 포스팅"}
        
        [데이터 추출 규칙 - 매우 중요]
        아래의 고정 서식을 최우선으로 분석하고, 누락 없이 JSON 결과에 반영하세요:
        1. '한 [숫자]': 'koreanCount'에 해당 숫자 입력. (한글 그림책 권수)
        2. '영 [숫자]': 'englishCount'에 해당 숫자 입력. (영어 그림책 권수)
        3. '집듣 [제목] ([정보], [n]권)': 'ortBooks'에 제목을 넣고, 'ortCount'에 숫자 n을 더함.
        4. '음독 [제목]': 'ortBooks'에 해당 제목을 줄바꿈으로 추가.
        5. '영상 [시간] ([제목])': 'dvdTime'에 시간, 'dvdTitle'에 제목 입력.
        6. '흘려듣기 [시간] ([제목])': 'audioTime'에 시간, 'audioTitle'에 제목 입력.
        
        [추가 지시사항]
        - 'theme'(주제) 필드는 반드시 "" (빈 문자열)로 반환하세요.
        - 모든 결과는 반드시 아래 구조의 순수한 JSON 형식으로만 답변하세요:
        
        {
          "theme": "",
          "dvdTitle": "...",
          "dvdTime": "...",
          "audioTitle": "...",
          "audioTime": "...",
          "koreanBooks": "제목1\\n제목2",
          "koreanCount": n,
          "englishBooks": "제목1\\n제목2",
          "englishCount": n,
          "ortBooks": "제목1\\n제목2",
          "ortCount": n
        }
      `;

async function test() {
  try {
    const result = await model.generateContent(prompt);
    const text = result.response.text();
    console.log("RAW OUTPUT:\n", text);
    
    // Sanitize and Parse JSON
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const aiResult = JSON.parse(jsonMatch[0]);
      console.log("\nPARSED JSON:\n", aiResult);
    } else {
      console.log("NO JSON FOUND");
    }
  } catch (err) {
    console.error(err);
  }
}

test();
