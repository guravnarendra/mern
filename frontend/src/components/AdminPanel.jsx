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

  // Initialize audio
  useEffect(() => {
    audioRef.current = new Audio(notificationSound);
    audioRef.current.load();
    
    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    const fetchAppointments = async () => {
      try {
        setIsLoading(true);
        const response = await axios.get(
          `http://localhost:2400/api/admin/appointments?status=${filter === 'all' ? '' : filter}`
        );
        setAppointments(response.data.appointments);
      } catch (error) {
        console.error('Error fetching appointments:', error);
        alert('Failed to load appointments');
      } finally {
        setIsLoading(false);
      }
    };

    fetchAppointments();

    const eventSource = new EventSource('http://localhost:2400/api/admin/updates');
    
    eventSource.onopen = () => {
      console.log('SSE connection established');
      setIsConnected(true);
    };

    eventSource.onmessage = (event) => {
      if (event.data === 'Connected') return;
      
      try {
        const data = JSON.parse(event.data);
        
        if (data.type === 'DELETE') {
          setAppointments(prev => prev.filter(app => app.id !== data.data.id));
        }
        else if (data.type === 'UPDATE') {
          setAppointments(prev => prev.map(app => 
            app.id === data.data.id ? data.data : app
          ));
        }
        else if (data.type === 'NEW') {
          setAppointments(prev => [data.data, ...prev]);
          if (audioRef.current) {
            audioRef.current.currentTime = 0;
            audioRef.current.play().catch(e => console.log('Audio play failed:', e));
          }
        }
      } catch (error) {
        console.error('Error parsing SSE data:', error);
      }
    };

    eventSource.onerror = () => {
      console.log('SSE error');
      setIsConnected(false);
      eventSource.close();
    };

    return () => {
      eventSource.close();
    };
  }, [filter]);

  const confirmAppointment = async (id) => {
    try {
      setIsLoading(true);
      const response = await axios.patch(
        `http://localhost:2400/api/admin/appointments/${id}`,
        { status: 'Confirmed' }
      );
      
      setAppointments(prev => prev.map(app => 
        app.id === id ? { ...app, ...response.data, isConfirmed: true } : app
      ));
    } catch (error) {
      console.error('Confirmation error:', error);
      alert(`Failed to confirm appointment: ${error.response?.data?.error || error.message}`);
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
      await axios.delete(`http://localhost:2400/api/admin/appointments/${id}`);
      setAppointments(prev => prev.filter(app => app.id !== id));
    } catch (error) {
      console.error('Cancellation error:', error);
      alert(`Failed to cancel appointment: ${error.response?.data?.error || error.message}`);
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
          Status: <span className={isConnected ? 'connected' : 'disconnected'}>
            {isConnected ? 'Connected' : 'Disconnected'}
          </span>
        </div>
        
        <div className="filter-controls">
          <div className="search-controls">
            <input
              type="text"
              placeholder="Search appointments..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              disabled={isLoading}
            />
          </div>
          
          <div className="filter-select">
            <label>Filter:</label>
            <select 
              value={filter} 
              onChange={(e) => setFilter(e.target.value)}
              disabled={isLoading}
            >
              <option value="all">All Appointments</option>
              <option value="Pending">Pending</option>
              <option value="Confirmed">Confirmed</option>
            </select>
          </div>
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
                disabled={isLoading}
              >
                Show All Appointments
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
                <p><strong>Booked at:</strong> {new Date(appointment.createdAt).toLocaleString()}</p>
                <p><strong>Last updated:</strong> {new Date(appointment.lastUpdated).toLocaleString()}</p>
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
