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
  const weekId = searchParams.get('weekId');

  if (!year || !month || !week) {
    return NextResponse.json({ error: 'Missing parameters' }, { status: 400 });
  }

  const client = await pool.connect();
  try {
    // Database Initialization
    await client.query(`
      CREATE TABLE IF NOT EXISTS week_subjects (
        year INTEGER NOT NULL,
        month INTEGER NOT NULL,
        week INTEGER NOT NULL,
        week_id TEXT,
        subjects JSONB NOT NULL DEFAULT '[]',
        PRIMARY KEY (year, month, week)
      );
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS weekly_logs (
        id TEXT PRIMARY KEY,
        year INTEGER NOT NULL,
        month INTEGER NOT NULL,
        week INTEGER NOT NULL,
        week_id TEXT,
        date_string TEXT NOT NULL,
        checks JSONB NOT NULL DEFAULT '{}',
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Fetch subjects
    let subjectsResult;
    if (weekId) {
      subjectsResult = await client.query(
        'SELECT subjects FROM week_subjects WHERE week_id = $1',
        [weekId]
      );
      if (subjectsResult.rows.length === 0) {
        subjectsResult = await client.query(
          'SELECT subjects FROM week_subjects WHERE year = $1 AND month = $2 AND week = $3',
          [year, month, week]
        );
      }
    } else {
      subjectsResult = await client.query(
        'SELECT subjects FROM week_subjects WHERE year = $1 AND month = $2 AND week = $3',
        [year, month, week]
      );
    }
    
    // Default subjects if not found
    const defaultSubjects = ["원리셈", "왕수학", "교구놀이", "팩토", "신문", "집중듣기", "SB/독해", "영어책5권", "한글책5권"];
    const subjects = subjectsResult.rows.length > 0 ? subjectsResult.rows[0].subjects : defaultSubjects;

    // Fetch logs
    let logsResult;
    if (weekId) {
      logsResult = await client.query(
        'SELECT * FROM weekly_logs WHERE week_id = $1 ORDER BY id ASC',
        [weekId]
      );
      if (logsResult.rows.length === 0) {
        logsResult = await client.query(
          'SELECT * FROM weekly_logs WHERE year = $1 AND month = $2 AND week = $3 ORDER BY id ASC',
          [year, month, week]
        );
      }
    } else {
      logsResult = await client.query(
        'SELECT * FROM weekly_logs WHERE year = $1 AND month = $2 AND week = $3 ORDER BY id ASC',
        [year, month, week]
      );
    }

    const logs = logsResult.rows.map(row => ({
      id: row.id,
      date: row.date_string,
      year: row.year,
      month: row.month,
      week: row.week,
      checks: row.checks || {}
    }));

    return NextResponse.json({ subjects, logs });
  } catch (error) {
    console.error('Database error in weekly-plan GET:', error);
    return NextResponse.json({ error: 'Failed to fetch weekly plan' }, { status: 500 });
  } finally {
    client.release();
  }
}

export async function POST(request: Request) {
  const client = await pool.connect();
  try {
    const body = await request.json();
    const { year, month, week, weekId, subjects, logs } = body;

    if (!year || !month || !week || !Array.isArray(subjects) || !Array.isArray(logs)) {
      return NextResponse.json({ error: 'Invalid data' }, { status: 400 });
    }

    await client.query('BEGIN');

    // Update subjects
    if (weekId) {
      await client.query(
        `INSERT INTO week_subjects (year, month, week, week_id, subjects)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (year, month, week) 
         DO UPDATE SET subjects = EXCLUDED.subjects, week_id = EXCLUDED.week_id`,
        [year, month, week, weekId, JSON.stringify(subjects)]
      );
    } else {
      await client.query(
        `INSERT INTO week_subjects (year, month, week, subjects)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (year, month, week) 
         DO UPDATE SET subjects = EXCLUDED.subjects`,
        [year, month, week, JSON.stringify(subjects)]
      );
    }

    // Clear existing logs
    if (weekId) {
      await client.query(
        'DELETE FROM weekly_logs WHERE week_id = $1 OR (year = $2 AND month = $3 AND week = $4)',
        [weekId, year, month, week]
      );
    } else {
      await client.query(
        'DELETE FROM weekly_logs WHERE year = $1 AND month = $2 AND week = $3',
        [year, month, week]
      );
    }

    // Insert new logs
    if (logs.length > 0) {
      for (const log of logs) {
        // Skip purely empty checks objects
        if (!log.checks || Object.keys(log.checks).length === 0) continue;

        await client.query(
          `INSERT INTO weekly_logs (
            id, year, month, week, week_id, date_string, checks, updated_at
           )
           VALUES ($1, $2, $3, $4, $5, $6, $7, CURRENT_TIMESTAMP)`,
          [log.id, year, month, week, weekId || null, log.date, JSON.stringify(log.checks)]
        );
      }
    }

    await client.query('COMMIT');
    return NextResponse.json({ success: true });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Database error in weekly-plan POST:', error);
    return NextResponse.json({ error: 'Failed to save weekly plan' }, { status: 500 });
  } finally {
    client.release();
  }
}
