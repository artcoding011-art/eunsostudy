import { sql } from '@vercel/postgres';
import { NextResponse } from 'next/server';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const year = parseInt(searchParams.get('year') || '0');

  if (!year) {
    return NextResponse.json({ error: 'Missing year' }, { status: 400 });
  }

  try {
    // Only proceed if table exists (will be created by /api/logs if not)
    const result = await sql`
      SELECT 
        SUM(korean_count) as "korean", 
        SUM(english_count) as "english"
      FROM reading_logs 
      WHERE year = ${year};
    `;

    const stats = {
      korean: Number(result.rows[0]?.korean) || 0,
      english: Number(result.rows[0]?.english) || 0,
      total: (Number(result.rows[0]?.korean) || 0) + (Number(result.rows[0]?.english) || 0)
    };

    return NextResponse.json(stats);
  } catch (error) {
    console.error('Database error:', error);
    // Return zeros if table hasn't been created yet
    return NextResponse.json({ korean: 0, english: 0, total: 0 });
  }
}
