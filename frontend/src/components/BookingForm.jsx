import React, { useState } from 'react';
import axios from 'axios';
import './BookingForm.css';

function BookingForm() {
  const [formData, setFormData] = useState({
    name: '',
    address: '',
    phone: '',
    email: '',
    service: 'Haircut'
  });
  const [status, setStatus] = useState({ type: '', message: '' });

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setStatus({ type: 'loading', message: 'Processing...' });
    
    try {
      const response = await axios.post('https://mern-pxsj.onrender.com/api/appointments', formData);
      
      if (response.data.success) {
        setStatus({ 
          type: 'success', 
          message: 'Appointment booked successfully!' 
        });
        setFormData({
          name: '',
          address: '',
          phone: '',
          email: '',
          service: 'Haircut'
        });
        
        // Clear success message after 3 seconds
        setTimeout(() => setStatus({ type: '', message: '' }), 3000);
      }
    } catch (error) {
      console.error('Booking error:', error);
      const errorMsg = error.response?.data?.error || 'Failed to book appointment';
      setStatus({ type: 'error', message: errorMsg });
    }
  };

  return (
    <div className="booking-form-container">
      <h2>Book Your Appointment</h2>
      
      {status.message && (
        <div className={`alert ${status.type}`}>
          {status.message}
        </div>
      )}
      
      <form onSubmit={handleSubmit}>
        <div className="form-group">
          <label>Name*:</label>
          <input 
            type="text" 
            name="name" 
            value={formData.name} 
            onChange={handleChange} 
            required 
          />
        </div>
        
        <div className="form-group">
          <label>Address:</label>
          <input 
            type="text" 
            name="address" 
            value={formData.address} 
            onChange={handleChange} 
          />
        </div>
        
        <div className="form-group">
          <label>Phone Number*:</label>
          <input 
            type="tel" 
            name="phone" 
            value={formData.phone} 
            onChange={handleChange} 
            required 
          />
        </div>
        
        <div className="form-group">
          <label>Email:</label>
          <input 
            type="email" 
            name="email" 
            value={formData.email} 
            onChange={handleChange} 
          />
        </div>
        
        <div className="form-group">
          <label>Service:</label>
          <select 
            name="service" 
            value={formData.service} 
            onChange={handleChange}
          >
            <option value="Haircut">Haircut</option>
            <option value="Shave">Shave</option>
            <option value="Beard Trim">Beard Trim</option>
            <option value="Haircut & Shave">Haircut & Shave</option>
            <option value="Full Service">Full Service</option>
          </select>
        </div>
        
        <button 
          type="submit" 
          className="submit-btn"
          disabled={status.type === 'loading'}
        >
          {status.type === 'loading' ? 'Booking...' : 'Book Appointment'}
        </button>
      </form>
    </div>
  );
}

export default BookingForm;
