import { sql } from '@vercel/postgres';
import { NextResponse } from 'next/server';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const year = parseInt(searchParams.get('year') || '0');
  const month = parseInt(searchParams.get('month') || '0');
  const week = parseInt(searchParams.get('week') || '0');

  if (!year || !month || !week) {
    return NextResponse.json({ error: 'Missing parameters' }, { status: 400 });
  }

  try {
    // Initialize tables if they don't exist
    await sql`
      CREATE TABLE IF NOT EXISTS reading_logs (
        id TEXT PRIMARY KEY,
        year INTEGER NOT NULL,
        month INTEGER NOT NULL,
        week INTEGER NOT NULL,
        date_string TEXT NOT NULL,
        dvd_title TEXT DEFAULT '',
        dvd_time TEXT DEFAULT '',
        audio_title TEXT DEFAULT '',
        audio_time TEXT DEFAULT '',
        korean_books TEXT DEFAULT '',
        korean_count INTEGER DEFAULT 0,
        english_books TEXT DEFAULT '',
        english_count INTEGER DEFAULT 0,
        ort_books TEXT DEFAULT '',
        ort_count INTEGER DEFAULT 0,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `;

    await sql`
      CREATE TABLE IF NOT EXISTS week_themes (
        year INTEGER NOT NULL,
        month INTEGER NOT NULL,
        week INTEGER NOT NULL,
        theme TEXT DEFAULT '',
        PRIMARY KEY (year, month, week)
      );
    `;

    // Fetch theme
    const themeResult = await sql`
      SELECT theme FROM week_themes 
      WHERE year = ${year} AND month = ${month} AND week = ${week};
    `;
    const theme = themeResult.rows[0]?.theme || "";

    // Fetch logs
    const logsResult = await sql`
      SELECT * FROM reading_logs 
      WHERE year = ${year} AND month = ${month} AND week = ${week}
      ORDER BY id ASC;
    `;

    // Map DB rows back to LogEntry interface
    const logs = logsResult.rows.map(row => ({
      id: row.id,
      date: row.date_string,
      year: row.year,
      month: row.month,
      week: row.week,
      dvdTitle: row.dvd_title,
      dvdTime: row.dvd_time,
      audioTitle: row.audio_title,
      audioTime: row.audio_time,
      koreanBooks: row.korean_books,
      koreanCount: row.korean_count,
      englishBooks: row.english_books,
      englishCount: row.english_count,
      ortBooks: row.ort_books,
      ortCount: row.ort_count
    }));

    return NextResponse.json({ logs, theme });
  } catch (error) {
    console.error('Database error:', error);
    return NextResponse.json({ error: 'Failed to fetch logs' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { year, month, week, logs, theme } = body;

    if (!year || !month || !week || !Array.isArray(logs)) {
      return NextResponse.json({ error: 'Invalid data' }, { status: 400 });
    }

    // Update theme
    await sql`
      INSERT INTO week_themes (year, month, week, theme)
      VALUES (${year}, ${month}, ${week}, ${theme})
      ON CONFLICT (year, month, week) 
      DO UPDATE SET theme = EXCLUDED.theme;
    `;

    // Update logs
    for (const log of logs) {
      await sql`
        INSERT INTO reading_logs (
          id, year, month, week, date_string, 
          dvd_title, dvd_time, audio_title, audio_time, 
          korean_books, korean_count, english_books, english_count, 
          ort_books, ort_count, updated_at
        ) VALUES (
          ${log.id}, ${year}, ${month}, ${week}, ${log.date},
          ${log.dvdTitle || ''}, ${log.dvdTime || ''}, ${log.audioTitle || ''}, ${log.audioTime || ''},
          ${log.koreanBooks || ''}, ${log.koreanCount || 0}, ${log.englishBooks || ''}, ${log.englishCount || 0},
          ${log.ortBooks || ''}, ${log.ortCount || 0}, CURRENT_TIMESTAMP
        )
        ON CONFLICT (id) DO UPDATE SET
          dvd_title = EXCLUDED.dvd_title,
          dvd_time = EXCLUDED.dvd_time,
          audio_title = EXCLUDED.audio_title,
          audio_time = EXCLUDED.audio_time,
          korean_books = EXCLUDED.korean_books,
          korean_count = EXCLUDED.korean_count,
          english_books = EXCLUDED.english_books,
          english_count = EXCLUDED.english_count,
          ort_books = EXCLUDED.ort_books,
          ort_count = EXCLUDED.ort_count,
          updated_at = CURRENT_TIMESTAMP;
      `;
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Database error:', error);
    return NextResponse.json({ error: 'Failed to save logs' }, { status: 500 });
  }
}
