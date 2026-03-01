import { createContext, useContext, useState, useEffect, useRef } from 'react';
import api from '../api';

const VMContext = createContext();

export const useVM = () => useContext(VMContext);

export const VMProvider = ({ children }) => {
  // Load session data from localStorage on mount
  const loadSessionsFromStorage = () => {
    try {
      const stored = localStorage.getItem('vmActiveSessions');
      console.log("Loading sessions from storage:", stored);
      const sessions = stored ? new Map(JSON.parse(stored)) : new Map();
      console.log("Parsed sessions:", Array.from(sessions.entries()));
      return sessions;
    } catch (error) {
      console.error('Failed to load sessions from storage:', error);
      return new Map();
    }
  };

  const [activeSessions, setActiveSessions] = useState(new Map(loadSessionsFromStorage()));
  const [reconnectAttempts, setReconnectAttempts] = useState(new Map());
  const [sessionReports, setSessionReports] = useState([]);

  // Save sessions to localStorage whenever they change
  useEffect(() => {
    try {
      const sessionsArray = Array.from(activeSessions.entries());
      console.log("Saving sessions to storage:", sessionsArray);
      localStorage.setItem('vmActiveSessions', JSON.stringify(sessionsArray));
      console.log("Sessions saved successfully");
    } catch (error) {
      console.error('Failed to save sessions to storage:', error);
    }
  }, [activeSessions]);

  // Register a new VM session with metrics tracking
  const registerSession = (vmId, sessionData) => {
    // Check if there's an existing session to preserve session name
    const existingSession = activeSessions.get(vmId);
    
    console.log("Session registration debug:", {
      vmId,
      existingSession: existingSession?.sessionName,
      existingCommands: existingSession?.commands?.length,
      newSessionData: sessionData,
      hasExistingSession: !!existingSession
    });
    
    // If session already exists, don't overwrite it - just update connection info
    if (existingSession) {
      console.log("Session already exists, preserving all data");
      setActiveSessions(prev => {
        const newSessions = new Map(prev);
        // Only update connection-specific data, preserve everything else
        newSessions.set(vmId, {
          ...existingSession,
          sessionId: sessionData.sessionId,
          host: sessionData.host,
          lastActivity: Date.now()
        });
        return newSessions;
      });
      return;
    }
    
    // Create new session only if none exists
    const sessionWithMetrics = {
      ...sessionData,
      startTime: Date.now(),
      commands: [],
      totalCommands: 0,
      successfulCommands: 0,
      failedCommands: 0,
      totalExecutionTime: 0,
      lastActivity: Date.now(),
      reconnectAttempts: 0,
      sessionName: null
    };
    
    console.log("Creating new session:", {
      vmId,
      sessionId: sessionWithMetrics.sessionId,
      sessionName: sessionWithMetrics.sessionName
    });
    
    setActiveSessions(prev => {
      const newSessions = new Map(prev);
      newSessions.set(vmId, sessionWithMetrics);
      return newSessions;
    });
  };

  // Update session name
  const updateSessionName = (vmId, name) => {
    console.log("Updating session name:", { vmId, name });
    
    setActiveSessions(prev => {
      const newSessions = new Map(prev);
      if (newSessions.has(vmId)) {
        const session = newSessions.get(vmId);
        console.log("Session before name update:", session.sessionName);
        newSessions.set(vmId, {
          ...session,
          sessionName: name
        });
        console.log("Session after name update:", name);
      } else {
        console.log("No session found for vmId:", vmId);
      }
      return newSessions;
    });
  };

  // Get existing session for VM
  const getSession = (vmId) => {
    return activeSessions.get(vmId);
  };

  // Track command execution
  const trackCommand = (vmId, command, executionTime, success = true) => {
    setActiveSessions(prev => {
      const newSessions = new Map(prev);
      if (newSessions.has(vmId)) {
        const session = newSessions.get(vmId);
        const updatedSession = {
          ...session,
          commands: [...session.commands, {
            command,
            timestamp: Date.now(),
            executionTime,
            success
          }],
          totalCommands: session.totalCommands + 1,
          successfulCommands: session.successfulCommands + (success ? 1 : 0),
          failedCommands: session.failedCommands + (success ? 0 : 1),
          totalExecutionTime: session.totalExecutionTime + executionTime,
          lastActivity: Date.now()
        };
        newSessions.set(vmId, updatedSession);
      }
      return newSessions;
    });
  };

  // Update session activity
  const updateSessionActivity = (vmId) => {
    setActiveSessions(prev => {
      const newSessions = new Map(prev);
      if (newSessions.has(vmId)) {
        newSessions.get(vmId).lastActivity = Date.now();
      }
      return newSessions;
    });
  };

  // Generate and save report when session ends
  const generateSessionReport = (vmId, vmHost) => {
    const session = activeSessions.get(vmId);
    if (!session) return null;

    const endTime = Date.now();
    const sessionDuration = endTime - session.startTime;
    
    const report = {
      sessionId: `SESSION-${vmId}-${Date.now()}`,
      vmId,
      vmHost,
      sessionName: session.sessionName || `VM Session ${new Date(session.startTime).toLocaleDateString()}`,
      startTime: new Date(session.startTime).toISOString(),
      endTime: new Date(endTime).toISOString(),
      duration: sessionDuration,
      totalCommands: session.totalCommands,
      successfulCommands: session.successfulCommands,
      failedCommands: session.failedCommands,
      successRate: session.totalCommands > 0 ? (session.successfulCommands / session.totalCommands * 100).toFixed(1) : 0,
      averageExecutionTime: session.totalCommands > 0 ? (session.totalExecutionTime / session.totalCommands).toFixed(0) : 0,
      commands: session.commands,
      generatedAt: new Date().toISOString()
    };

    // Save to localStorage for persistence
    const existingReports = JSON.parse(localStorage.getItem('vmSessionReports') || '[]');
    const updatedReports = [report, ...existingReports].slice(0, 100); // Keep last 100 reports
    localStorage.setItem('vmSessionReports', JSON.stringify(updatedReports));
    setSessionReports(updatedReports);

    return report;
  };

  // Remove session (only on explicit disconnect)
  const removeSession = (vmId) => {
    console.log("Removing session for vmId:", vmId);
    setActiveSessions(prev => {
      const newSessions = new Map(prev);
      newSessions.delete(vmId);
      console.log("Session removed, remaining sessions:", Array.from(newSessions.entries()));
      return newSessions;
    });
    setReconnectAttempts(prev => {
      const newAttempts = new Map(prev);
      newAttempts.delete(vmId);
      return newAttempts;
    });
  };

  // Increment reconnect attempts
  const incrementReconnectAttempts = (vmId) => {
    setReconnectAttempts(prev => {
      const newAttempts = new Map(prev);
      newAttempts.set(vmId, (newAttempts.get(vmId) || 0) + 1);
      return newAttempts;
    });
  };

  // Reset reconnect attempts
  const resetReconnectAttempts = (vmId) => {
    setReconnectAttempts(prev => {
      const newAttempts = new Map(prev);
      newAttempts.set(vmId, 0);
      return newAttempts;
    });
  };

  // Check if VM has active session
  const hasActiveSession = (vmId) => {
    return activeSessions.has(vmId);
  };

  // Load saved reports on mount
  useEffect(() => {
    const savedReports = JSON.parse(localStorage.getItem('vmSessionReports') || '[]');
    setSessionReports(savedReports);
  }, []);

  // Cleanup old sessions (optional safety net)
  useEffect(() => {
    const cleanup = setInterval(() => {
      const now = Date.now();
      const timeout = 30 * 60 * 1000; // 30 minutes

      setActiveSessions(prev => {
        const newSessions = new Map();
        for (const [vmId, session] of prev) {
          if (now - session.lastActivity < timeout) {
            newSessions.set(vmId, session);
          }
        }
        return newSessions;
      });
    }, 5 * 60 * 1000); // Check every 5 minutes

    return () => clearInterval(cleanup);
  }, []);

  const value = {
    activeSessions,
    sessionReports,
    registerSession,
    getSession,
    trackCommand,
    updateSessionActivity,
    updateSessionName,
    removeSession,
    hasActiveSession,
    generateSessionReport,
    incrementReconnectAttempts,
    resetReconnectAttempts,
    reconnectAttempts
  };

  return (
    <VMContext.Provider value={value}>
      {children}
    </VMContext.Provider>
  );
};
