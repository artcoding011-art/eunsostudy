"use client";

import React, { useState, useEffect, useRef } from 'react';
import { toJpeg } from 'html-to-image';
import styles from './WeeklyPlan.module.css';

interface WeeklyLogEntry {
  id: string;
  date: string;
  year: number;
  month: number;
  week: number;
  checks: Record<string, boolean>;
}

function getMondayDate(year: number, month: number, week: number): string {
  const firstDay = new Date(year, month - 1, 1);
  const dayOfWeek = firstDay.getDay();
  const diffToMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
  const firstMonday = new Date(year, month - 1, 1 + diffToMonday);
  const monday = new Date(firstMonday.getTime() + (week - 1) * 7 * 24 * 60 * 60 * 1000);
  
  const y = monday.getFullYear();
  const m = String(monday.getMonth() + 1).padStart(2, '0');
  const d = String(monday.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function getDatesOfWeek(year: number, month: number, week: number) {
  const firstDay = new Date(year, month - 1, 1);
  const dayOfWeek = firstDay.getDay(); 
  const diffToMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
  const firstMonday = new Date(year, month - 1, 1 + diffToMonday);
  const startOfWeek = new Date(firstMonday.getTime() + (week - 1) * 7 * 24 * 60 * 60 * 1000);
  const dates = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(startOfWeek.getTime() + i * 24 * 60 * 60 * 1000);
    const dateStr = `${d.getMonth() + 1}월 ${d.getDate()}일 ${['일', '월', '화', '수', '목', '금', '토'][d.getDay()]}`;
    dates.push(dateStr);
  }
  return dates;
}

function generateLogsForWeek(year: number, month: number, week: number): WeeklyLogEntry[] {
  const dates = getDatesOfWeek(year, month, week);
  return dates.map((date, idx) => ({
    id: `${year}-${month}-${week}-${idx}`,
    date,
    year,
    month,
    week,
    checks: {}
  }));
}

const getCurrentWeekInfo = () => {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;
  const firstDay = new Date(year, month - 1, 1);
  const dayOfWeek = firstDay.getDay(); 
  const diffToMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
  const firstMonday = new Date(year, month - 1, 1 + diffToMonday);
  const diffMs = now.getTime() - firstMonday.getTime();
  const week = Math.floor(diffMs / (7 * 24 * 60 * 60 * 1000)) + 1;
  return { year, month, week: Math.max(1, Math.min(5, week)) };
};

export default function WeeklyPlanDashboard() {
  const initial = getCurrentWeekInfo();
  const [year, setYear] = useState(initial.year);
  const [month, setMonth] = useState(initial.month);
  const [selectedWeek, setSelectedWeek] = useState(initial.week); 
  
  const [subjects, setSubjects] = useState<string[]>([]);
  const [logs, setLogs] = useState<WeeklyLogEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showSaveModal, setShowSaveModal] = useState(false);
  const [isEditMode, setIsEditMode] = useState(false);

  const captureRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const loadData = async () => {
      setIsLoading(true);
      try {
        const weekId = getMondayDate(year, month, selectedWeek);
        const resp = await fetch(`/api/weekly-plan?year=${year}&month=${month}&week=${selectedWeek}&weekId=${weekId}`);
        if (resp.ok) {
          const data = await resp.json();
          const subjectsList = data.subjects || [];
          setSubjects(subjectsList);
          
          const getFullyChecked = () => {
            const checks: Record<string, boolean> = {};
            subjectsList.forEach((_: any, i: number) => { checks[`sub_${i}`] = true; });
            return checks;
          };

          const baseLogs = generateLogsForWeek(year, month, selectedWeek);
          if (data.logs && data.logs.length > 0) {
            const mergedLogs = baseLogs.map((baseLog: WeeklyLogEntry) => {
              const dbLog = data.logs.find((l: WeeklyLogEntry) => l.date === baseLog.date);
              return dbLog ? { ...baseLog, checks: dbLog.checks, id: baseLog.id } : { ...baseLog, checks: getFullyChecked() };
            });
            setLogs(mergedLogs);
          } else {
            setLogs(baseLogs.map(l => ({ ...l, checks: getFullyChecked() })));
          }
          setIsLoading(false);
          return;
        }
      } catch (e) {
        console.error("Failed to load data from DB", e);
      }

      // Fallback
      const defaultSubjects = ["원리셈", "왕수학", "교구놀이", "팩토", "신문", "집중듣기", "SB/독해", "영어책5권", "한글책5권"];
      setSubjects(defaultSubjects);
      const getFullyCheckedFallback = () => {
        const checks: Record<string, boolean> = {};
        defaultSubjects.forEach((_, i) => { checks[`sub_${i}`] = true; });
        return checks;
      };
      setLogs(generateLogsForWeek(year, month, selectedWeek).map(l => ({ ...l, checks: getFullyCheckedFallback() })));
      setIsLoading(false);
    };

    loadData();
  }, [year, month, selectedWeek]);

  const saveToDatabase = async () => {
    const weekId = getMondayDate(year, month, selectedWeek);
    const data = { 
      year, 
      month, 
      week: selectedWeek, 
      weekId,
      subjects,
      logs 
    };

    try {
      const resp = await fetch('/api/weekly-plan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      });

      if (resp.ok) {
        setShowSaveModal(true);
        setIsEditMode(false);
      } else {
        alert("저장에 실패했습니다. 잠시 후 다시 시도해 주세요.");
      }
    } catch (e) {
      console.error("Save failed:", e);
      alert("네트워크 오류가 발생했습니다.");
    }
  };

  const handleScreenshot = async () => {
    if (!captureRef.current) return;
    const originalClassName = captureRef.current.className;
    const originalBackground = captureRef.current.style.background;
    try {
      captureRef.current.className = originalClassName.replace('glass-panel', '');
      captureRef.current.style.background = '#ffffff';

      const dataUrl = await toJpeg(captureRef.current, { 
        quality: 1.0, 
        backgroundColor: '#ffffff',
        pixelRatio: 3,
        filter: (node) => {
          if (node instanceof HTMLElement && node.dataset.html2canvasIgnore === 'true') {
            return false;
          }
          return true;
        }
      });
      const link = document.createElement('a');
      link.href = dataUrl;
      link.download = `weekly-plan-${year}년-${month}월-${selectedWeek}주차.jpg`;
      link.click();
    } catch (err) {
      console.error("Screenshot failed:", err);
    } finally {
      captureRef.current.className = originalClassName;
      captureRef.current.style.background = originalBackground;
    }
  };

  const handlePrevMonth = () => {
    if (month === 1) { setYear(year - 1); setMonth(12); } 
    else { setMonth(month - 1); }
    setSelectedWeek(1);
  };
  const handleNextMonth = () => {
    if (month === 12) { setYear(year + 1); setMonth(1); } 
    else { setMonth(month + 1); }
    setSelectedWeek(1);
  };

  const toggleCheck = (logId: string, subjectIndex: number) => {
    setLogs(prev => prev.map(log => {
      if (log.id === logId) {
        const key = `sub_${subjectIndex}`;
        const currentVal = log.checks[key];
        return {
          ...log,
          checks: { ...log.checks, [key]: !currentVal }
        };
      }
      return log;
    }));
  };

  const handleSubjectChange = (index: number, newName: string) => {
    const newSubjects = [...subjects];
    newSubjects[index] = newName;
    setSubjects(newSubjects);
  };

  const addSubject = () => {
    setSubjects([...subjects, "새 과목"]);
  };

  const removeSubject = (index: number) => {
    const newSubjects = subjects.filter((_, i) => i !== index);
    setSubjects(newSubjects);
    setLogs(prev => prev.map(log => ({ ...log, checks: {} })));
  };

  // Calculate stats
  const stats = subjects.map((sub, index) => {
    const key = `sub_${index}`;
    const checkedCount = logs.filter(log => log.checks[key]).length;
    const progress = Math.round((checkedCount / 7) * 100);
    return { name: sub, checkedCount, progress };
  });

  return (
    <div className={styles.layout}>
      {/* Sidebar Calendar */}
      <aside className={`glass-panel ${styles.sidebar}`}>
        <div className={styles.monthSelector}>
          <button onClick={handlePrevMonth} className={styles.navButton}>{"<"}</button>
          <div className={styles.monthLabel}>{year}년<br/>{month}월</div>
          <button onClick={handleNextMonth} className={styles.navButton}>{">"}</button>
        </div>
        <div className={styles.weekList}>
          {[1, 2, 3, 4, 5].map((w) => (
            <button
              key={w}
              onClick={() => setSelectedWeek(w)}
              className={`${styles.weekButton} ${selectedWeek === w ? styles.activeWeek : ''}`}
            >
              {w}주차
            </button>
          ))}
        </div>
      </aside>

      {/* Main Content */}
      <div className={`glass-panel ${styles.dashboardContainer}`} ref={captureRef}>
        <header style={{ marginBottom: '1.5rem', textAlign: 'center' }}>
          <h1 style={{ 
            margin: 0, 
            fontSize: '2.5rem', 
            fontWeight: 800, 
            color: 'var(--primary-color)',
            display: 'flex',
            alignItems: 'baseline',
            justifyContent: 'center',
            gap: '15px'
          }}>
            Weekly Planner
          </h1>
        </header>

        <div className={styles.topControlBar} data-html2canvas-ignore="true">
          <div style={{ display: 'flex', gap: '10px' }}>
            <button onClick={() => setIsEditMode(!isEditMode)} className={styles.screenshotButton}>
              {isEditMode ? '편집 완료 🔒' : '과목 편집 ✏️'}
            </button>
            <button onClick={handleScreenshot} className={styles.screenshotButton}>이미지 저장 📸</button>
            <button onClick={saveToDatabase} className={styles.saveButton}>기록 저장 💾</button>
          </div>
        </div>

        {/* Table Area */}
        <div className={styles.tableWrapper}>
          {isLoading && (
            <div className={styles.loadingOverlay}>
              <div className={styles.loadingSpinner}>데이터를 불러오는 중...</div>
            </div>
          )}
          <table className={`${styles.logTable} ${isLoading ? styles.tableLoading : ''}`}>
            <thead>
              <tr>
                <th>Schedule<br/>Check</th>
                {subjects.map((sub, i) => (
                  <th key={i}>
                    {isEditMode ? (
                      <div style={{ display: 'flex', alignItems: 'center' }}>
                        <input 
                          type="text" 
                          value={sub} 
                          onChange={(e) => handleSubjectChange(i, e.target.value)}
                          className={styles.subjectEditInput}
                        />
                        <button className={styles.removeSubjectBtn} onClick={() => removeSubject(i)}>X</button>
                      </div>
                    ) : (
                      sub
                    )}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {logs.map((log) => (
                <tr key={log.id}>
                  <td className={styles.dateCell}>{log.date}</td>
                  {subjects.map((_, i) => {
                    const key = `sub_${i}`;
                    const isChecked = log.checks[key] === true;
                    return (
                      <td key={i} onClick={() => toggleCheck(log.id, i)} className={styles.checkCell}>
                        {isChecked ? (
                          <span className={styles.checked}>✔️</span>
                        ) : (
                          <span className={styles.unchecked}>—</span>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
          {isEditMode && (
            <div style={{ padding: '1rem' }}>
              <button className={styles.addSubjectBtn} onClick={addSubject}>+ 과목 추가</button>
            </div>
          )}
        </div>

        {/* Charts Area */}
        <div className={styles.chartsArea} style={{ marginTop: '2rem' }}>
          <div className={styles.chartsTitle}>주간 달성도 현황</div>
          <div className={styles.chartBarsContainer}>
            {stats.map((stat, i) => (
              <div key={i} className={styles.chartBarWrapper}>
                <div className={styles.chartLabel}>
                  <span>{stat.name}</span>
                  <span>{stat.checkedCount} / 7일</span>
                </div>
                <div className={styles.chartBarBg}>
                  <div className={styles.chartBarFill} style={{ width: `${stat.progress}%` }}></div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {showSaveModal && (
        <div className={styles.modalOverlay}>
          <div className={styles.modalContent}>
            <div className={styles.modalIcon}>✅</div>
            <h3 className={styles.modalTitle}>계획표가 저장되었습니다</h3>
            <button className={styles.modalBtn} onClick={() => setShowSaveModal(false)}>확인</button>
          </div>
        </div>
      )}
    </div>
  );
}
