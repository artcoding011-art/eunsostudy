import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenerativeAI } from "@google/generative-ai";

export async function POST(req: NextRequest) {
  try {
    const { date, content, images, mode } = await req.json(); // images: Array of { data: string, mimeType: string }
    if (!date && !content && !images) {
      return NextResponse.json({ error: 'Data is required' }, { status: 400 });
    }

    const apiKey = process.env.GOOGLE_GENAI_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: 'API Key missing' }, { status: 500 });
    }

    // 1. Simple Regex Pre-parsing (to save AI quota)
    const textToMatch = content || "";
    const koreanMatch = textToMatch.match(/한\s*(\d+)/);
    const englishMatch = textToMatch.match(/영\s*(\d+)/);
    
    // DVD/Audio Patterns: Support multiline and flexible characters
    const parseTime = (text: string) => {
      if (!text) return "";
      const hMatch = text.match(/(\d+)\s*시간/);
      const mMatch = text.match(/(\d+)\s*분/);
      const h = hMatch ? hMatch[1] : "0";
      const m = mMatch ? mMatch[1] : "0";
      if (h === "0") return m === "0" ? "" : m; 
      return `${h}:${m.padStart(2, '0')}`;
    };

    const dvdMatch = textToMatch.match(/영상\s*([^(\n]*)\s*\(([^)\n]*)\)/);
    const audioMatch = textToMatch.match(/흘려듣기\s*([^(\n]*)\s*\(([^)\n]*)\)/);
    
    // ORT Patterns: Find ALL "집듣" and "음독" entries
    const ortListenMatches = [...textToMatch.matchAll(/집듣\s*([^(\n]*)\s*\((?:.*?)(\d+)권.*?\)/g)];
    const ortReadMatches = [...textToMatch.matchAll(/음독\s*(.*)/g)];

    // Optimized shorthand detection
    const hasAnyMatch = koreanMatch || englishMatch || dvdMatch || audioMatch || ortListenMatches.length > 0 || ortReadMatches.length > 0;
    
    if (hasAnyMatch && textToMatch.length < 500 && textToMatch.length > 0) {
      console.log('[API] Shorthand/Short text detected, bypassing AI');
      
      const ortTitles: string[] = [];
      let ortCount = 0;

      ortListenMatches.forEach(m => {
        ortTitles.push(m[1].trim());
        ortCount += parseInt(m[2]);
      });

      ortReadMatches.forEach(m => {
        ortTitles.push(m[1].trim());
        // ortCount += 1; // 음독은 권수에서 제외
      });

      return NextResponse.json({
        dvdTitle: dvdMatch ? dvdMatch[2].trim() : "", 
        dvdTime: dvdMatch ? parseTime(dvdMatch[1]) : "",
        audioTitle: audioMatch ? audioMatch[2].trim() : "", 
        audioTime: audioMatch ? parseTime(audioMatch[1]) : "",
        koreanBooks: "", 
        koreanCount: koreanMatch ? parseInt(koreanMatch[1]) : 0,
        englishBooks: "", 
        englishCount: englishMatch ? parseInt(englishMatch[1]) : 0,
        ortBooks: ortTitles.join('\n'), 
        ortCount: ortCount
      });
    }

    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

    if (mode === 'ocr') {
      const ocrSchemaPrompt = `
        [분석 지침: Visual Book Title Extraction]
        1. 이미지 내 모든 책의 등표지(Spine)나 앞표지(Cover)를 꼼꼼하게 스캔하여 '책 제목'을 추출하세요.
        2. 디자인적 요소, 화려한 폰트, 세로쓰기된 제목도 놓치지 말고 정확하게 읽어내세요.
        3. 배경이나 저자명, 출판사 로고 등 부차적인 정보는 빼고 오로지 '제목'에만 집중하세요.
        4. 아래 JSON 형식으로만 응답하며, 확신이 없더라도 책 제목으로 보이는 텍스트는 최대한 포함시키세요.
        
        {
          "koreanBooks": "제목1\\n제목2",
          "englishBooks": "제목1\\n제목2",
          "koreanCount": 0,
          "englishCount": 0,
          "ortBooks": "",
          "ortCount": 0,
          "dvdTitle": "",
          "dvdTime": "",
          "audioTitle": "",
          "audioTime": ""
        }
        
        [출력 규칙]
        - 한글 제목은 'koreanBooks', 영어 제목은 'englishBooks'에 줄바꿈(\\n)으로 구분하여 넣으세요.
        - 제목과 관련 없는 노이즈(기호 등)는 최대한 정제하여 반환하세요.
        - 다른 설명 없이 순수한 JSON 데이터만 반환하세요.
      `;
      const imageParts = images?.map((img: any) => ({
        inlineData: { data: img.data, mimeType: img.mimeType }
      })) || [];

      const result = await model.generateContent([ocrSchemaPrompt, ...imageParts]);
      const responseText = result.response.text();
      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      if (!jsonMatch) return NextResponse.json({ error: 'Invalid AI Response' }, { status: 500 });
      return NextResponse.json(JSON.parse(jsonMatch[0]));
    }

    const prompt = `
      설명: 입력된 내용(텍스트 또는 이미지)에서 책 제목을 추출하여 반드시 JSON 형식으로만 반환하세요.
      
      [데이터 추출 규칙]
      1. 한글 책 제목 -> 'koreanBooks' (각 권을 줄바꿈으로 구분), 권수를 계산하여 'koreanCount'에 입력.
      2. 영어 책 제목 -> 'englishBooks' (각 권을 줄바꿈으로 구분), 권수를 계산하여 'englishCount'에 입력.
      3. 텍스트 기록이 함께 있다면, '집듣', '음독', '영상', '흘려듣기' 정보도 함께 추출하세요. 
         (집듣은 제목과 권수를 구분하고, 음독은 제목만 가져오세요.)
      4. 만약 추출할 내용이 전혀 없다면, 모든 필드를 빈 문자열("") 또는 0으로 채운 JSON을 반환하세요. 절대 설명을 덧붙이지 마세요.
      
      [기타 지시]
      - 이미지 속의 책 제목을 최대한 정확하게 인식하세요. (OCR)
      - 결과는 반드시 아래 구조의 순수한 JSON 형식으로만 답변하세요. 마크다운 기호 없이 { }로 시작하고 끝나야 합니다.
      
      {
        "dvdTitle": "", "dvdTime": "",
        "audioTitle": "", "audioTime": "",
        "koreanBooks": "제목1\\n제목2", "koreanCount": 0,
        "englishBooks": "제목1\\n제목2", "englishCount": 0,
        "ortBooks": "", "ortCount": 0
      }
      
      입력 텍스트:
      ${content || "이미지 분석 요청 (텍스트 없음)"}
    `;

    // 이미지 데이터가 있으면 파트로 변환
    const imageParts = images?.map((img: any) => ({
      inlineData: { data: img.data, mimeType: img.mimeType }
    })) || [];

    const result = await model.generateContent([prompt, ...imageParts]);
    const responseText = result.response.text();
    
    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('Invalid AI Response');
    
    const data = JSON.parse(jsonMatch[0]);
    return NextResponse.json(data);

  } catch (err: any) {
    console.error('[API Error]', err);
    // Pass through status code if available (e.g., 429)
    const status = err.status || 500;
    return NextResponse.json({ error: err.message }, { status });
  }
}
