"use client";

import React, { useState, useEffect, useRef } from 'react';
import { toJpeg } from 'html-to-image';
import styles from './ReadingLog.module.css';

interface LogEntry {
  id: string;
  date: string;
  theme: string;
  dvdTitle: string;
  dvdTime: string;
  audioTitle: string;
  audioTime: string;
  koreanBooks: string;
  koreanCount: number;
  englishBooks: string;
  englishCount: number;
  ortBooks: string;
  ortCount: number;
}

// Time parsing helpers
const parseTimeToMinutes = (timeStr: string): number => {
  if (!timeStr) return 0;
  if (timeStr.includes(':')) {
    const [h, m] = timeStr.split(':').map(Number);
    return (h || 0) * 60 + (m || 0);
  }
  let minutes = 0;
  const hourMatch = timeStr.match(/(\d+)\s*시간/);
  const minMatch = timeStr.match(/(\d+)\s*분/);
  if (hourMatch) minutes += parseInt(hourMatch[1]) * 60;
  if (minMatch) minutes += parseInt(minMatch[1]);
  if (!hourMatch && !minMatch) {
    const pureNum = timeStr.replace(/[^0-9]/g, '');
    if (pureNum) minutes += parseInt(pureNum);
  }
  return minutes;
};

const formatMinutesToTime = (totalMinutes: number): string => {
  if (totalMinutes === 0) return "";
  const hours = Math.floor(totalMinutes / 60);
  const mins = totalMinutes % 60;
  if (hours > 0 && mins > 0) return `${hours}시간 ${mins}분`;
  if (hours > 0) return `${hours}시간`;
  return `${mins}분`;
};

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

function generateLogsForWeek(year: number, month: number, week: number): LogEntry[] {
  const dates = getDatesOfWeek(year, month, week);
  return dates.map((date, idx) => ({
    id: `${year}-${month}-${week}-${idx}`,
    date,
    theme: "",
    dvdTitle: "",
    dvdTime: "",
    audioTitle: "",
    audioTime: "",
    koreanBooks: "",
    koreanCount: 0,
    englishBooks: "",
    englishCount: 0,
    ortBooks: "",
    ortCount: 0
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

export default function ReadingLogDashboard() {
  const initial = getCurrentWeekInfo();
  const [year, setYear] = useState(initial.year);
  const [month, setMonth] = useState(initial.month);
  const [selectedWeek, setSelectedWeek] = useState(initial.week); 
  const [showActions, setShowActions] = useState(true);
  
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [weekTheme, setWeekTheme] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [activePasteId, setActivePasteId] = useState<string | null>(null);
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [pasteValues, setPasteValues] = useState<Record<string, string>>({});
  const [editCell, setEditCell] = useState<{ id: string, field: keyof LogEntry } | null>(null);

  const handleEditChange = (id: string, field: keyof LogEntry, val: string) => {
    updateLogField(id, field, field.endsWith('Count') ? Number(val) || 0 : val);
  };

  const renderCell = (log: LogEntry, field: keyof LogEntry, isTextArea: boolean, displayValue: React.ReactNode, className?: string) => {
    const isEditing = editCell?.id === log.id && editCell?.field === field;
    return (
      <td className={className} onDoubleClick={() => setEditCell({ id: log.id, field })}>
        {isEditing ? (
          isTextArea ? (
            <textarea
              autoFocus
              className={styles.cellInput}
              defaultValue={String(log[field] || "")}
              onBlur={(e) => { handleEditChange(log.id, field, e.target.value); setEditCell(null); }}
              onKeyDown={(e) => { if(e.key === 'Escape') setEditCell(null); }}
            />
          ) : (
            <input
              autoFocus
              className={field.endsWith('Count') ? styles.countInput : (field.endsWith('Time') ? styles.timeInput : styles.cellInput)}
              defaultValue={String(log[field] || "")}
              onBlur={(e) => { handleEditChange(log.id, field, e.target.value); setEditCell(null); }}
              onKeyDown={(e) => { if(e.key === 'Enter') e.currentTarget.blur(); if(e.key === 'Escape') setEditCell(null); }}
            />
          )
        ) : displayValue}
      </td>
    );
  };
  const [currentImage, setCurrentImage] = useState<{data: string, mimeType: string} | null>(null);
  const [currentPasteSource, setCurrentPasteSource] = useState<'ocr' | 'manual' | null>(null);
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [cumulativeStats, setCumulativeStats] = useState({ korean: 0, english: 0, total: 0 });
  const [showSaveModal, setShowSaveModal] = useState(false);
  const captureRef = useRef<HTMLDivElement>(null);

  const fetchCumulativeStats = async () => {
    try {
      const resp = await fetch(`/api/stats?year=${year}`);
      if (resp.ok) {
        const data = await resp.json();
        setCumulativeStats(data);
      }
    } catch (e) {
      console.error("Failed to fetch cumulative stats:", e);
    }
  };

  useEffect(() => {
    const loadData = async () => {
      setIsLoading(true);
      
      // 1. Fetch cumulative
      fetchCumulativeStats();

      // 2. Load current week data from DB
      try {
        const resp = await fetch(`/api/logs?year=${year}&month=${month}&week=${selectedWeek}`);
        if (resp.ok) {
          const data = await resp.json();
          if (data.logs && data.logs.length > 0) {
            setLogs(data.logs);
            setWeekTheme(data.theme || "");
            setIsLoading(false);
            return;
          }
        }
      } catch (e) {
        console.error("Failed to load data from DB", e);
      }

      // Fallback to local generation if no DB data
      setLogs(generateLogsForWeek(year, month, selectedWeek));
      setWeekTheme("");
      setIsLoading(false);
    };

    loadData();
  }, [year, month, selectedWeek]);

  const saveToDatabase = async () => {
    const data = { 
      year, 
      month, 
      week: selectedWeek, 
      logs, 
      theme: weekTheme 
    };

    try {
      const resp = await fetch('/api/logs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      });

      if (resp.ok) {
        fetchCumulativeStats();
        setShowSaveModal(true);
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
      link.download = `reading-log-${year}년-${month}월-${selectedWeek}주차.jpg`;
      link.click();
    } catch (err) {
      console.error("Screenshot failed:", err);
    } finally {
      captureRef.current.className = originalClassName;
      captureRef.current.style.background = originalBackground;
    }
  };

  const resizeImage = (file: File): Promise<string> => {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement('canvas');
          let width = img.width;
          let height = img.height;
          const maxDim = 1600;

          if (width > height) {
            if (width > maxDim) {
              height *= maxDim / width;
              width = maxDim;
            }
          } else {
            if (height > maxDim) {
              width *= maxDim / height;
              height = maxDim;
            }
          }

          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          ctx?.drawImage(img, 0, 0, width, height);
          resolve(canvas.toDataURL('image/jpeg', 0.8).split(',')[1]);
        };
        img.src = e.target?.result as string;
      };
      reader.readAsDataURL(file);
    });
  };

  const handleImageUpload = async (logId: string, date: string, file: File) => {
    setLoadingId(logId);
    try {
      const base64Data = await resizeImage(file);
      const mimeType = 'image/jpeg';
      setCurrentImage({ data: base64Data, mimeType });

      try {
        const response = await fetch('/api/fetch-blog', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ date, mode: 'ocr', images: [{ data: base64Data, mimeType }] })
        });

        let shorthand = "";
        if (response.ok) {
          const data = await response.json();
          // If the AI returns structured JSON instead of just .text
          if (data && !data.text) {
            if (data.koreanBooks) data.koreanBooks.split('\n').filter((t: string) => t.trim()).forEach((t: string) => shorthand += `${t}\n`);
            if (data.englishBooks) data.englishBooks.split('\n').filter((t: string) => t.trim()).forEach((t: string) => shorthand += `${t}\n`);
            if (data.dvdTitle) shorthand += `영상 ${data.dvdTime || ""} (${data.dvdTitle})\n`;
            if (data.audioTitle) shorthand += `흘려듣기 ${data.audioTime || ""} (${data.audioTitle})\n`;
            if (data.ortBooks) data.ortBooks.split('\n').filter((t: string) => t.trim()).forEach((t: string) => shorthand += `집듣 ${t}\n`);
          } else if (data && data.text) {
            shorthand = data.text;
          }
        } else {
          try {
            const errData = await response.json();
            shorthand = `⚠️ AI 분석 실패: ${errData.error || "알 수 없는 오류"}\n직접 입력해 주세요.`;
          } catch (e) {
            shorthand = `⚠️ AI 분석 실패 (코드 ${response.status})\n직접 입력해 주세요.`;
          }
        }

        // Always show the modal for preview/feedback
        setPasteValues(prev => ({ 
          ...prev, 
          [logId]: shorthand.trim() || "AI가 제목을 찾지 못했습니다. 직접 입력해 주세요." 
        }));
        setActivePasteId(logId);
        setCurrentPasteSource('ocr');
      } catch (aiErr) {
        console.error("AI Analysis critical failure:", aiErr);
        setPasteValues(prev => ({ 
          ...prev, 
          [logId]: "⚠️ AI 분석 중 오류가 발생했습니다. 직접 입력해 주세요." 
        }));
        setActivePasteId(logId);
        setCurrentPasteSource('ocr');
      }
    } finally {
      setLoadingId(null);
    }
  };

  const handlePaste = (logId: string, date: string, text: string, isOCR: boolean) => {
    const lines = text.split('\n').map(l => l.trim()).filter(l => l);
    let koreanBooks: string[] = [];
    let englishBooks: string[] = [];
    let koreanCount = 0;
    let englishCount = 0;
    let dvdTitle = "";
    let dvdTime = "";
    let audioTitle = "";
    let audioTime = "";
    let ortBooks: string[] = [];
    let ortCount = 0;

    const parseTime = (val: string) => val.includes('시간') || val.includes('분') ? val : val + "분";

    lines.forEach(line => {
      // 1. Shorthand Parsing (Unified)
      const summaryMatch = line.match(/^(?:한\s*(\d+))?[,\s]*(?:영\s*(\d+))?[,\s]*(?:누적.*)?$/);
      const korMatch = line.match(/^한\s*(\d+)\s*(.*)/);
      const engMatch = line.match(/^영\s*(\d+)\s*(.*)/);
      const dvdMatch = line.match(/영상\s*([^(\n]*)\s*\(([^)\n]*)\)/);
      const audioMatch = line.match(/흘려듣기\s*([^(\n]*)\s*\(([^)\n]*)\)/);
      const ortListenMatch = line.match(/^집듣\s*(.*?)?(?:\s+(\d+)\s*권)?(?:\s*\([^)]*\))?$/);
      const ortReadMatch = line.match(/^음독\s*(.*)/);

      if (summaryMatch && (summaryMatch[1] || summaryMatch[2]) && !line.includes('권')) {
         if (summaryMatch[1]) koreanCount += parseInt(summaryMatch[1]);
         if (summaryMatch[2]) englishCount += parseInt(summaryMatch[2]);
      } else if (korMatch) {
         let count = parseInt(korMatch[1]);
         let title = korMatch[2].trim();
         if (title.match(/^,\s*영\s*(\d+)/)) {
           const inlineEng = title.match(/^,\s*영\s*(\d+)\s*,?\s*(.*)/);
           if (inlineEng) {
             englishCount += parseInt(inlineEng[1]);
             title = inlineEng[2].trim();
             title = title.replace(/^누적\s*/, '').trim();
           }
         }
         koreanCount += count;
         if (title && title !== '누적') koreanBooks.push(title);
      } else if (engMatch) {
         let count = parseInt(engMatch[1]);
         let title = engMatch[2].trim();
         if (title === '누적' || title.startsWith(', 누적')) title = "";
         englishCount += count;
         if (title) englishBooks.push(title);
      } else if (dvdMatch) {
         dvdTitle = dvdMatch[2].trim(); 
         dvdTime = parseTime(dvdMatch[1]);
      } else if (audioMatch) {
         audioTitle = audioMatch[2].trim(); 
         audioTime = parseTime(audioMatch[1]);
      } else if (ortListenMatch) {
         if (ortListenMatch[1]) ortBooks.push(ortListenMatch[1].trim()); 
         if (ortListenMatch[2]) ortCount += parseInt(ortListenMatch[2]);
         else ortCount += 1;
      } else if (ortReadMatch) {
         ortBooks.push(ortReadMatch[1].trim());
      } else if (isOCR) {
        // Fallback for OCR lines without markers - Titles only as requested
        const hasKorean = /[ㄱ-ㅎ|ㅏ-ㅣ|가-힣]/.test(line);
        if (hasKorean) {
          koreanBooks.push(line);
        } else {
          englishBooks.push(line);
        }
      }
    });

    setLogs(prev => prev.map(log => {
      if (log.id === logId) {
        return {
          ...log,
          koreanCount: log.koreanCount + koreanCount,
          englishCount: log.englishCount + englishCount,
          koreanBooks: (log.koreanBooks ? log.koreanBooks + "\n" : "") + koreanBooks.join('\n'),
          englishBooks: (log.englishBooks ? log.englishBooks + "\n" : "") + englishBooks.join('\n'),
          dvdTitle: dvdTitle || log.dvdTitle,
          dvdTime: dvdTime || log.dvdTime,
          audioTitle: audioTitle || log.audioTitle,
          audioTime: audioTime || log.audioTime,
          ortBooks: ortBooks.length > 0 ? (log.ortBooks ? log.ortBooks + "\n" : "") + ortBooks.join('\n') : log.ortBooks,
          ortCount: log.ortCount + ortCount
        };
      }
      return log;
    }));
    setActivePasteId(null);
    setCurrentPasteSource(null);
    setPasteValues(prev => ({ ...prev, [logId]: '' }));
  };

  const handleClearLog = (logId: string) => {
    if (confirmingId === logId) {
      setLogs(prev => prev.map(log => log.id === logId ? {
        ...log, dvdTitle: "", dvdTime: "", audioTitle: "", audioTime: "",
        koreanBooks: "", koreanCount: 0, englishBooks: "", englishCount: 0, ortBooks: "", ortCount: 0
      } : log));
      setConfirmingId(null);
    } else {
      setConfirmingId(logId);
      // Auto-cancel after 3 seconds
      setTimeout(() => {
        setConfirmingId(prev => prev === logId ? null : prev);
      }, 3000);
    }
  };

  const updateLogField = (logId: string, field: keyof LogEntry, value: string | number) => {
    setLogs(prev => prev.map(log => log.id === logId ? { ...log, [field]: value } : log));
  };

  const totalKorean = logs.reduce((sum, log) => sum + log.koreanCount, 0);
  const totalEnglish = logs.reduce((sum, log) => sum + log.englishCount, 0);
  const totalOrt = logs.reduce((sum, log) => sum + log.ortCount, 0);
  const totalDvdMinutes = logs.reduce((sum, log) => sum + parseTimeToMinutes(log.dvdTime), 0);
  const totalAudioMinutes = logs.reduce((sum, log) => sum + parseTimeToMinutes(log.audioTime), 0);
  const totalDvdTimeStr = formatMinutesToTime(totalDvdMinutes);
  const totalAudioTimeStr = formatMinutesToTime(totalAudioMinutes);

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
        <button className={styles.toggleActionsBtn} onClick={() => setShowActions(!showActions)}>
          {showActions ? '기능 숨기기 🙈' : '기능 보이기 👁️'}
        </button>
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
            수리플젝 일지
            <span style={{ fontSize: '1.25rem', fontWeight: 500, color: '#666' }}>
              <b style={{ fontWeight: 800, color: '#333' }}>원더쏘</b> (8세 & 3세 여아) - 2024년 6월 시작
            </span>
          </h1>
        </header>

        <div className={styles.topControlBar}>
          <div className={styles.globalThemeSection}>
            <span className={styles.themeLabel}>주제 :</span>
            <input 
              type="text" 
              className={styles.globalThemeInput} 
              value={weekTheme}
              onChange={(e) => setWeekTheme(e.target.value)}
              placeholder="이번 주 주제를 입력하세요"
            />
          </div>
          
          <div className={styles.cumulativeSection}>
            <span className={styles.cumulativeLabel}>올해 누적:</span>
            <div className={styles.cumulativeMetrics}>
              <span className={styles.cItem}>한글 <span className={styles.cValue}>{cumulativeStats.korean}</span>권</span>
              <span className={styles.cDivider}>|</span>
              <span className={styles.cItem}>영어 <span className={styles.cValue}>{cumulativeStats.english}</span>권</span>
              <span className={styles.cDivider}>|</span>
              <span className={styles.cItemTotal}>총합 <span className={styles.cValueTotal}>{cumulativeStats.total}</span>권</span>
            </div>
          </div>

          <div style={{ display: 'flex', gap: '10px' }} data-html2canvas-ignore="true">
            <button onClick={handleScreenshot} className={styles.screenshotButton}>이미지 저장 📸</button>
            <button onClick={saveToDatabase} className={styles.saveButton}>기록 저장 💾</button>
          </div>
        </div>

        <div className={styles.tableWrapper}>
          {isLoading && (
            <div className={styles.loadingOverlay}>
              <div className={styles.loadingSpinner}>데이터를 불러오는 중...</div>
            </div>
          )}
          <table className={`${styles.logTable} ${isLoading ? styles.tableLoading : ''}`}>
            <thead>
              <tr>
                {showActions && <th rowSpan={2}>기능</th>}
                <th rowSpan={2}>날짜</th>
                <th colSpan={2}>DVD 영상</th>
                <th colSpan={2}>소리노출(흘듣)</th>
                <th colSpan={2}>한글 그림책</th>
                <th colSpan={2}>영어 그림책</th>
                <th colSpan={2}>ORT(집듣)</th>
              </tr>
              <tr>
                <th>제목</th><th>시간</th><th>제목</th><th>시간</th>
                <th>제목</th><th>권수</th><th>제목</th><th>권수</th><th>제목</th><th>권수</th>
              </tr>
            </thead>
            <tbody>
              {logs.map((log) => (
                <tr key={log.id}>
                  {showActions && (
                    <td className={styles.center}>
                      <div className={styles.actionCell}>
                        {loadingId === log.id ? (
                          <div className={styles.analyzingText}>분석 중...</div>
                        ) : (
                          <div className={styles.actionFlex}>
                            <label className={styles.imageUploadBtn}>📷
                              <input type="file" accept="image/*" capture="environment" style={{ display: 'none' }} 
                                onChange={(e) => { const file = e.target.files?.[0]; if (file) handleImageUpload(log.id, log.date, file); }} />
                            </label>
                            <button type="button" className={styles.quickPasteBtn} onClick={(e) => { e.stopPropagation(); setPasteValues(prev => ({ ...prev, [log.id]: '' })); setActivePasteId(log.id); setCurrentPasteSource('manual'); }}>⚡</button>
                            <button 
                              type="button" 
                              className={`${styles.clearRowBtn} ${confirmingId === log.id ? styles.confirming : ''}`} 
                              onClick={(e) => { e.stopPropagation(); handleClearLog(log.id); }}
                            >
                              {confirmingId === log.id ? '🔥' : '🗑️'}
                            </button>
                          </div>
                        )}
                        {activePasteId === log.id && (
                          <div className={styles.inlinePasteWrapper}>
                            <textarea autoFocus className={styles.inlinePasteTextarea}
                              placeholder={currentPasteSource === 'ocr' ? "분석된 책 제목들을 확인하세요." : "한 5, 영 3..."}
                              value={pasteValues[log.id] || ""}
                              onChange={(e) => setPasteValues(prev => ({ ...prev, [log.id]: e.target.value }))}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter' && e.ctrlKey) handlePaste(log.id, log.date, pasteValues[log.id] || "", currentPasteSource === 'ocr');
                                if (e.key === 'Escape') { setActivePasteId(null); setCurrentPasteSource(null); }
                              }}
                            />
                            <div className={styles.pasteActionRow}>
                              <button className={styles.applyPasteBtn} onClick={() => handlePaste(log.id, log.date, pasteValues[log.id] || "", currentPasteSource === 'ocr')}>적용</button>
                              <button className={styles.cancelPasteBtn} onClick={() => { setActivePasteId(null); setCurrentPasteSource(null); setPasteValues(prev => ({ ...prev, [log.id]: '' })); }}>취소</button>
                            </div>
                          </div>
                        )}
                      </div>
                    </td>
                  )}
                  <td className={styles.dateCell}>{log.date}</td>
                  {renderCell(log, 'dvdTitle', false, log.dvdTitle)}
                  {renderCell(log, 'dvdTime', false, log.dvdTime, styles.center)}
                  {renderCell(log, 'audioTitle', false, log.audioTitle)}
                  {renderCell(log, 'audioTime', false, log.audioTime, styles.center)}
                  {renderCell(log, 'koreanBooks', true, log.koreanBooks ? (
                    <div className={styles.titlePreview}>
                      {log.koreanBooks.split('\n').map((b, i) => b.trim() && <div key={i}>• {b}</div>)}
                    </div>
                  ) : null, styles.titleCell)}
                  {renderCell(log, 'koreanCount', false, log.koreanCount || "", styles.center)}
                  {renderCell(log, 'englishBooks', true, log.englishBooks ? (
                    <div className={styles.titlePreview}>
                      {log.englishBooks.split('\n').map((b, i) => b.trim() && <div key={i}>• {b}</div>)}
                    </div>
                  ) : null, styles.titleCell)}
                  {renderCell(log, 'englishCount', false, log.englishCount || "", styles.center)}
                  {renderCell(log, 'ortBooks', true, log.ortBooks ? (
                    <div className={styles.titlePreview}>
                      {log.ortBooks.split('\n').map((b, i) => b.trim() && <div key={i}>• {b}</div>)}
                    </div>
                  ) : null, styles.titleCell)}
                  {renderCell(log, 'ortCount', false, log.ortCount || "", styles.center)}
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className={styles.totalRow}>
                <td colSpan={showActions ? 2 : 1} className={styles.totalLabel}>합계</td>
                <td></td><td className={styles.center}>{totalDvdTimeStr}</td>
                <td></td><td className={styles.center}>{totalAudioTimeStr}</td>
                <td></td><td className={styles.center}>{totalKorean}</td>
                <td></td><td className={styles.center}>{totalEnglish}</td>
                <td></td><td className={styles.center}>{totalOrt}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      {showSaveModal && (
        <div className={styles.modalOverlay}>
          <div className={styles.modalContent}>
            <div className={styles.modalIcon}>✅</div>
            <h3 className={styles.modalTitle}>기록이 저장되었습니다</h3>
            <button className={styles.modalBtn} onClick={() => setShowSaveModal(false)}>확인</button>
          </div>
        </div>
      )}
    </div>
  );
}
