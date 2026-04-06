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
  const month = parseInt(searchParams.get('month') || '0');
  const week = parseInt(searchParams.get('week') || '0');

  if (!year || !month || !week) {
    return NextResponse.json({ error: 'Missing parameters' }, { status: 400 });
  }

  const client = await pool.connect();
  try {
    // Extensive table initialization (ensure all columns exist)
    await client.query(`
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
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS week_themes (
        year INTEGER NOT NULL,
        month INTEGER NOT NULL,
        week INTEGER NOT NULL,
        theme TEXT NOT NULL,
        PRIMARY KEY (year, month, week)
      );
    `);

    // Fetch theme
    const themeResult = await client.query(
      'SELECT theme FROM week_themes WHERE year = $1 AND month = $2 AND week = $3',
      [year, month, week]
    );

    // Fetch logs (Mapped back to frontend camelCase keys)
    const logsResult = await client.query(
      'SELECT * FROM reading_logs WHERE year = $1 AND month = $2 AND week = $3 ORDER BY id ASC',
      [year, month, week]
    );

    const logs = logsResult.rows.map(row => ({
      id: row.id,
      date: row.date_string,
      year: row.year,
      month: row.month,
      week: row.week,
      dvdTitle: row.dvd_title || "",
      dvdTime: row.dvd_time || "",
      audioTitle: row.audio_title || "",
      audioTime: row.audio_time || "",
      koreanBooks: row.korean_books || "",
      koreanCount: Number(row.korean_count || 0),
      englishBooks: row.english_books || "",
      englishCount: Number(row.english_count || 0),
      ortBooks: row.ort_books || "",
      ortCount: Number(row.ort_count || 0)
    }));

    return NextResponse.json({ 
      logs, 
      theme: themeResult.rows[0]?.theme || '' 
    });
  } catch (error) {
    console.error('Database error:', error);
    return NextResponse.json({ error: 'Failed to fetch logs' }, { status: 500 });
  } finally {
    client.release();
  }
}

export async function POST(request: Request) {
  const client = await pool.connect();
  try {
    const body = await request.json();
    const { year, month, week, logs, theme } = body;

    if (!year || !month || !week || !Array.isArray(logs)) {
      return NextResponse.json({ error: 'Invalid data' }, { status: 400 });
    }

    await client.query('BEGIN');

    // Update theme
    await client.query(
      `INSERT INTO week_themes (year, month, week, theme)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (year, month, week) 
       DO UPDATE SET theme = EXCLUDED.theme`,
      [year, month, week, theme]
    );

    // Clear existing logs for this week
    await client.query(
      'DELETE FROM reading_logs WHERE year = $1 AND month = $2 AND week = $3',
      [year, month, week]
    );

    // Insert new logs (only those with data)
    if (logs.length > 0) {
      for (const log of logs) {
        // Skip purely empty entries
        const hasData = log.dvdTitle || log.dvdTime || log.audioTitle || log.audioTime || 
                        log.koreanBooks || log.koreanCount || 
                        log.englishBooks || log.englishCount || 
                        log.ortBooks || log.ortCount;
        
        if (!hasData) continue;

        await client.query(
          `INSERT INTO reading_logs (
            id, year, month, week, date_string,
            dvd_title, dvd_time, audio_title, audio_time,
            korean_books, korean_count, english_books, english_count,
            ort_books, ort_count, updated_at
           )
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, CURRENT_TIMESTAMP)`,
          [
            log.id, year, month, week, log.date,
            log.dvdTitle || '', log.dvdTime || '', log.audioTitle || '', log.audioTime || '',
            log.koreanBooks || '', log.koreanCount || 0, log.englishBooks || '', log.englishCount || 0,
            log.ortBooks || '', log.ortCount || 0
          ]
        );
      }
    }

    await client.query('COMMIT');
    return NextResponse.json({ success: true });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Database error:', error);
    return NextResponse.json({ error: 'Failed to save logs' }, { status: 500 });
  } finally {
    client.release();
  }
}
