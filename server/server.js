require('dotenv').config();
const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const { v4: uuidv4 } = require('uuid');
const mongoose = require('mongoose');
const app = express();

// MongoDB Connection
mongoose.connect(process.env.MONGODB_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true
});

const db = mongoose.connection;
db.on('error', console.error.bind(console, 'MongoDB connection error:'));
db.once('open', () => {
  console.log('Connected to MongoDB');
  Appointment.createIndexes()
    .then(() => console.log('Indexes created'))
    .catch(err => console.error('Index creation error:', err));
});

// Reconnect if MongoDB disconnects
mongoose.connection.on('disconnected', () => {
  console.log('MongoDB disconnected - reconnecting...');
  setTimeout(() => mongoose.connect(process.env.MONGODB_URI), 5000);
});

// Appointment Schema
const appointmentSchema = new mongoose.Schema({
  id: { type: String, unique: true },
  name: { type: String, required: true },
  address: String,
  phone: { type: String, required: true },
  email: String,
  service: { type: String, default: 'Haircut' },
  status: { type: String, default: 'Pending' },
  isConfirmed: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now },
  lastUpdated: { type: Date, default: Date.now }
});

const Appointment = mongoose.model('Appointment', appointmentSchema);

// Middleware
app.use(cors({
  origin: process.env.FRONTEND_URL,
  methods: ['GET', 'POST', 'PATCH', 'DELETE'],
  credentials: true
}));
app.use(bodyParser.json());

let adminConnections = [];

// API Welcome Route
app.get('/', (req, res) => {
  res.status(200).json({
    message: "Barber Shop API is running",
    availableEndpoints: {
      createAppointment: "POST /api/appointments",
      getAppointments: "GET /api/admin/appointments",
      updateStatus: "PATCH /api/admin/appointments/:id",
      deleteAppointment: "DELETE /api/admin/appointments/:id",
      realtimeUpdates: "GET /api/admin/updates",
      healthCheck: "GET /health"
    }
  });
});

// Create Appointment
app.post('/api/appointments', async (req, res) => {
  try {
    const { name, phone, email, service, address } = req.body;
    
    if (!name || !phone) {
      return res.status(400).json({ error: 'Name and phone are required' });
    }

    const newAppointment = new Appointment({
      id: uuidv4(),
      name,
      address: address || '',
      phone,
      email: email || '',
      service: service || 'Haircut'
    });

    const savedAppointment = await newAppointment.save();
    notifyAdmins({ type: 'NEW', data: savedAppointment });
    
    res.status(201).json({
      success: true,
      appointment: savedAppointment
    });
  } catch (error) {
    console.error('Error creating appointment:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Update Appointment Status
app.patch('/api/admin/appointments/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    if (status === 'Confirmed') {
      const updatedAppointment = await Appointment.findOneAndUpdate(
        { id },
        { 
          status,
          isConfirmed: true,
          lastUpdated: Date.now()
        },
        { new: true }
      );

      if (!updatedAppointment) {
        return res.status(404).json({ error: 'Appointment not found' });
      }

      notifyAdmins({ type: 'UPDATE', data: updatedAppointment });
      return res.json(updatedAppointment);
    }

    return res.status(400).json({ error: 'Invalid status update' });
  } catch (error) {
    console.error('Error updating appointment:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Cancel and Delete Appointment
app.delete('/api/admin/appointments/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const deletedAppointment = await Appointment.findOneAndDelete({ id });

    if (!deletedAppointment) {
      return res.status(404).json({ error: 'Appointment not found' });
    }

    notifyAdmins({ type: 'DELETE', data: { id } });
    res.json({ success: true, message: 'Appointment deleted' });
  } catch (error) {
    console.error('Error deleting appointment:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get All Appointments
app.get('/api/admin/appointments', async (req, res) => {
  try {
    const { status } = req.query;
    let query = {};
    
    if (status && status !== 'all') {
      query.status = status;
    }

    const appointments = await Appointment.find(query).sort({ createdAt: -1 });
    res.json({ appointments });
  } catch (error) {
    console.error('Error fetching appointments:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// SSE Endpoint (Vercel-optimized)
app.get('/api/admin/updates', async (req, res) => {
  // Vercel-specific headers
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();

  // Immediate heartbeat
  res.write('retry: 5000\n\n');
  
  const clientId = Date.now();
  const sendEvent = (type, data) => {
    try {
      res.write(`event: ${type}\ndata: ${JSON.stringify(data)}\n\n`);
    } catch (e) {
      console.log('Client disconnected');
    }
  };

  // Add to connections list
  adminConnections.push({ id: clientId, sendEvent });
  
  // Send initial state
  try {
    const appointments = await Appointment.find().sort({ createdAt: -1 });
    sendEvent('init', { appointments });
  } catch (error) {
    console.error('Error sending initial state:', error);
  }

  // Heartbeat every 15 seconds
  const heartbeat = setInterval(() => {
    try {
      res.write(':heartbeat\n\n');
    } catch (e) {
      clearInterval(heartbeat);
    }
  }, 15000);

  req.on('close', () => {
    clearInterval(heartbeat);
    adminConnections = adminConnections.filter(conn => conn.id !== clientId);
    console.log(`Client ${clientId} disconnected`);
  });
});

// Health Check
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'OK',
    timestamp: new Date(),
    dbStatus: mongoose.connection.readyState === 1 ? 'Connected' : 'Disconnected',
    uptime: process.uptime(),
    connectedClients: adminConnections.length
  });
});

// Helper function to notify all admin panels
function notifyAdmins(data) {
  adminConnections.forEach(connection => {
    try {
      connection.sendEvent(data.type, data);
    } catch (e) {
      console.log('Client disconnected');
    }
  });
}

const PORT = process.env.PORT || 2400;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
