"use client";

import React, { useState } from 'react';
import ReadingLogDashboard from "@/components/ReadingLogDashboard";
import WeeklyPlanDashboard from "@/components/WeeklyPlanDashboard";

export default function Home() {
  const [activeTab, setActiveTab] = useState<'log' | 'plan'>('plan');

  return (
    <main style={{ padding: '1rem 2rem 2rem', width: '100%', maxWidth: '1800px', margin: '0 auto' }}>
      
      <div style={{
        display: 'flex',
        gap: '1rem',
        marginBottom: '2rem',
        justifyContent: 'center'
      }}>
        <button 
          onClick={() => setActiveTab('log')}
          style={{
            padding: '1rem 2rem',
            fontSize: '1.2rem',
            fontWeight: 'bold',
            borderRadius: '16px',
            border: 'none',
            cursor: 'pointer',
            background: activeTab === 'log' ? 'var(--primary-color)' : 'rgba(255, 255, 255, 0.5)',
            color: activeTab === 'log' ? 'white' : '#666',
            boxShadow: activeTab === 'log' ? '0 4px 15px rgba(89, 78, 230, 0.3)' : 'none',
            transition: 'all 0.3s'
          }}
        >
          수리플젝 일지 (Reading Log)
        </button>
        <button 
          onClick={() => setActiveTab('plan')}
          style={{
            padding: '1rem 2rem',
            fontSize: '1.2rem',
            fontWeight: 'bold',
            borderRadius: '16px',
            border: 'none',
            cursor: 'pointer',
            background: activeTab === 'plan' ? 'var(--primary-color)' : 'rgba(255, 255, 255, 0.5)',
            color: activeTab === 'plan' ? 'white' : '#666',
            boxShadow: activeTab === 'plan' ? '0 4px 15px rgba(89, 78, 230, 0.3)' : 'none',
            transition: 'all 0.3s'
          }}
        >
          주간 계획표 (Weekly Plan)
        </button>
      </div>

      {activeTab === 'log' ? <ReadingLogDashboard /> : <WeeklyPlanDashboard />}
    </main>
  );
}
