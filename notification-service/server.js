const dns = require('dns');
dns.setServers(['8.8.8.8', '1.1.1.1']);

const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');

const app = express();
app.use(cors());
app.use(express.json());

const notificationSchema = new mongoose.Schema(
  {
    userId: { type: String, required: true },
    orderId: String,
    type: { type: String, default: 'ORDER_CONFIRMATION' },
    message: { type: String, required: true },
    channel: { type: String, default: 'email' },
    status: { type: String, default: 'SENT' }
  },
  { timestamps: true }
);

notificationSchema.set('toJSON', {
  virtuals: true,
  versionKey: false,
  transform: (_, ret) => { delete ret._id; }
});

const Notification = mongoose.model('Notification', notificationSchema);

app.get('/', (req, res) => res.send('Notification Service running...'));
app.get('/health', (req, res) => res.json({ status: 'ok', service: 'notification-service' }));

// "Sends" a notification: logs it and saves a record
app.post('/notifications', async (req, res) => {
  const { user_id, order_id, type, message } = req.body;

  if (!user_id || !message) {
    return res.status(400).json({ error: 'user_id and message are required' });
  }

  try {
    const notification = await Notification.create({
      userId: user_id,
      orderId: order_id,
      type,
      message
    });
    console.log(`[NOTIFICATION] to user ${user_id}: ${message}`);
    res.status(201).json(notification);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/notifications', async (req, res) => {
  const filter = req.query.user_id ? { userId: req.query.user_id } : {};
  const notifications = await Notification.find(filter).sort({ createdAt: -1 });
  res.json(notifications);
});

const PORT = process.env.PORT || 3006;

mongoose
  .connect(process.env.MONGO_URI, { dbName: 'notificationdb' })
  .then(() => {
    console.log('Connected to MongoDB (notificationdb)');
    app.listen(PORT, () => console.log(`Notification service running on port ${PORT}`));
  })
  .catch((err) => {
    console.error('MongoDB connection failed:', err.message);
    process.exit(1);
  });