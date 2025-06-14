import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import './AdminPanel.css';
import notificationSound from './notification.mp3';

function AdminPanel() {
  const [appointments, setAppointments] = useState([]);
  const [isConnected, setIsConnected] = useState(false);
  const [filter, setFilter] = useState('all');
  const [isLoading, setIsLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const audioRef = useRef(null);
  const API_URL = process.env.REACT_APP_API_URL || 'https://mern-pxsj.onrender.com';

  // Initialize audio
  useEffect(() => {
    const audio = new Audio(notificationSound);
    audio.volume = 0.3;
    audio.load();
    audioRef.current = () => {
      audio.currentTime = 0;
      audio.play().catch(e => console.log('Audio blocked:', e));
    };
    
    return () => {
      audio.pause();
    };
  }, []);

  // SSE Connection
  useEffect(() => {
    const connectSSE = () => {
      const eventSource = new EventSource(`${API_URL}/api/admin/updates`);
      
      eventSource.addEventListener('init', (event) => {
        const data = JSON.parse(event.data);
        setAppointments(data.appointments);
        setIsConnected(true);
      });

      eventSource.addEventListener('update', (event) => {
        const updatedApp = JSON.parse(event.data);
        setAppointments(prev => prev.map(app => 
          app.id === updatedApp.id ? updatedApp : app
        ));
      });

      eventSource.addEventListener('new', (event) => {
        const newApp = JSON.parse(event.data);
        setAppointments(prev => [newApp, ...prev]);
        audioRef.current();
      });

      eventSource.addEventListener('delete', (event) => {
        const { id } = JSON.parse(event.data);
        setAppointments(prev => prev.filter(app => app.id !== id));
      });

      eventSource.onerror = () => {
        setIsConnected(false);
        eventSource.close();
        setTimeout(connectSSE, 3000); // Reconnect after 3 seconds
      };

      return eventSource;
    };

    const es = connectSSE();
    return () => es.close();
  }, [API_URL]);

  // Initial data load and polling fallback
  useEffect(() => {
    const fetchAppointments = async () => {
      try {
        setIsLoading(true);
        const response = await axios.get(`${API_URL}/api/admin/appointments`);
        setAppointments(response.data.appointments);
      } catch (error) {
        console.error('Error fetching appointments:', error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchAppointments();

    // Polling fallback in case SSE fails
    const pollInterval = setInterval(() => {
      if (!isConnected) {
        fetchAppointments();
      }
    }, 15000);

    return () => clearInterval(pollInterval);
  }, [API_URL, isConnected]);

  const confirmAppointment = async (id) => {
    try {
      setIsLoading(true);
      const response = await axios.patch(
        `${API_URL}/api/admin/appointments/${id}`,
        { status: 'Confirmed' }
      );
      setAppointments(prev => prev.map(app => 
        app.id === id ? { ...app, ...response.data, isConfirmed: true } : app
      ));
    } catch (error) {
      console.error('Confirmation error:', error);
      alert(`Failed to confirm: ${error.response?.data?.error || error.message}`);
    } finally {
      setIsLoading(false);
    }
  };

  const cancelAppointment = async (id) => {
    if (!window.confirm('Are you sure you want to cancel and delete this appointment?')) {
      return;
    }

    try {
      setIsLoading(true);
      await axios.delete(`${API_URL}/api/admin/appointments/${id}`);
      setAppointments(prev => prev.filter(app => app.id !== id));
    } catch (error) {
      console.error('Cancellation error:', error);
      alert(`Failed to cancel: ${error.response?.data?.error || error.message}`);
    } finally {
      setIsLoading(false);
    }
  };

  const filteredAppointments = appointments.filter(app => {
    const matchesFilter = filter === 'all' || app.status === filter;
    const matchesSearch = app.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
                         app.phone.includes(searchTerm);
    return matchesFilter && matchesSearch;
  });

  return (
    <div className="admin-panel">
      <h2>Appointments Management</h2>
      
      <div className="admin-controls">
        <div className="connection-status">
          Connection: 
          <span className={isConnected ? 'connected' : 'disconnected'}>
            {isConnected ? ' Live' : ' Reconnecting...'}
          </span>
        </div>
        
        <div className="search-controls">
          <input
            type="text"
            placeholder="Search appointments..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            disabled={isLoading}
          />
        </div>
        
        <div className="filter-controls">
          <label>Filter:</label>
          <select 
            value={filter} 
            onChange={(e) => setFilter(e.target.value)}
            disabled={isLoading}
          >
            <option value="all">All</option>
            <option value="Pending">Pending</option>
            <option value="Confirmed">Confirmed</option>
          </select>
        </div>
      </div>
      
      {isLoading && (
        <div className="loading-overlay">
          <div className="loading-spinner"></div>
        </div>
      )}
      
      <div className="appointments-list">
        {filteredAppointments.length === 0 ? (
          <div className="no-appointments">
            <p>No appointments found</p>
            {filter !== 'all' && (
              <button 
                onClick={() => setFilter('all')}
                className="reset-filter-btn"
              >
                Show All
              </button>
            )}
          </div>
        ) : (
          filteredAppointments.map(appointment => (
            <div 
              key={appointment.id} 
              className={`appointment-card ${appointment.isConfirmed ? 'confirmed' : ''}`}
            >
              <div className="card-header">
                <h3>{appointment.name} - {appointment.service}</h3>
                <span className={`status-badge ${appointment.status.toLowerCase()}`}>
                  {appointment.status}
                </span>
              </div>
              
              <div className="card-body">
                <p><strong>Phone:</strong> {appointment.phone}</p>
                {appointment.email && <p><strong>Email:</strong> {appointment.email}</p>}
                {appointment.address && <p><strong>Address:</strong> {appointment.address}</p>}
                <p><strong>Booked:</strong> {new Date(appointment.createdAt).toLocaleString()}</p>
              </div>
              
              <div className="card-actions">
                <button 
                  onClick={() => confirmAppointment(appointment.id)}
                  disabled={appointment.isConfirmed || isLoading}
                  className={`confirm-btn ${appointment.isConfirmed ? 'confirmed' : ''}`}
                >
                  {appointment.isConfirmed ? 'Confirmed' : 'Confirm'}
                </button>
                <button 
                  onClick={() => cancelAppointment(appointment.id)}
                  disabled={isLoading}
                  className="cancel-btn"
                >
                  Cancel
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

export default AdminPanel;
