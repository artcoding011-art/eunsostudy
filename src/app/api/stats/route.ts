import { Pool } from 'pg';
import { NextResponse } from 'next/server';

const pool = new Pool({
  connectionString: process.env.POSTGRES_URL,
  ssl: {
    rejectUnauthorized: false
  }
});

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const year = parseInt(searchParams.get('year') || '0');

  if (!year) {
    return NextResponse.json({ error: 'Missing year' }, { status: 400 });
  }

  const client = await pool.connect();
  try {
    const result = await client.query(
      `SELECT 
        SUM(korean_count) as "korean", 
        SUM(english_count) as "english",
        SUM(ort_count) as "ort"
       FROM reading_logs 
       WHERE year = $1`,
      [year]
    );

    const korean = Number(result.rows[0]?.korean || 0);
    const english = Number(result.rows[0]?.english || 0);
    const ort = Number(result.rows[0]?.ort || 0);

    return NextResponse.json({
      korean,
      english,
      ort,
      total: korean + english + ort
    });
  } catch (error) {
    console.error('Database error:', error);
    return NextResponse.json({ korean: 0, english: 0, ort: 0, total: 0 });
  } finally {
    client.release();
  }
}
