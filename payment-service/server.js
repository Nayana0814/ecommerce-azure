const dns = require('dns');
dns.setServers(['8.8.8.8', '1.1.1.1']);

const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');

const app = express();
app.use(cors());
app.use(express.json());

const paymentSchema = new mongoose.Schema(
  {
    orderId: String,
    userId: { type: String, required: true },
    amount: { type: Number, required: true, min: 0 },
    method: { type: String, default: 'card' },
    status: { type: String, enum: ['SUCCESS', 'FAILED'], required: true },
    transactionId: String
  },
  { timestamps: true }
);

paymentSchema.set('toJSON', {
  virtuals: true,
  versionKey: false,
  transform: (_, ret) => { delete ret._id; }
});

const Payment = mongoose.model('Payment', paymentSchema);

app.get('/', (req, res) => res.send('Payment Service running...'));
app.get('/health', (req, res) => res.json({ status: 'ok', service: 'payment-service' }));

// Mock payment: succeeds unless simulate_failure is true
app.post('/payments', async (req, res) => {
  const { order_id, user_id, amount, method, simulate_failure } = req.body;

  if (!user_id || !amount || amount <= 0) {
    return res.status(400).json({ error: 'user_id and a positive amount are required' });
  }

  const status = simulate_failure ? 'FAILED' : 'SUCCESS';
  const transactionId = `TXN-${Date.now()}-${Math.floor(Math.random() * 10000)}`;

  try {
    const payment = await Payment.create({
      orderId: order_id,
      userId: user_id,
      amount,
      method: method || 'card',
      status,
      transactionId
    });
    res.status(201).json(payment);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/payments', async (req, res) => {
  const filter = req.query.user_id ? { userId: req.query.user_id } : {};
  const payments = await Payment.find(filter).sort({ createdAt: -1 });
  res.json(payments);
});

app.get('/payments/:id', async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) {
    return res.status(404).json({ error: 'Payment not found' });
  }
  const payment = await Payment.findById(req.params.id);
  if (!payment) return res.status(404).json({ error: 'Payment not found' });
  res.json(payment);
});

const PORT = process.env.PORT || 3005;

mongoose
  .connect(process.env.MONGO_URI, { dbName: 'paymentdb' })
  .then(() => {
    console.log('Connected to MongoDB (paymentdb)');
    app.listen(PORT, () => console.log(`Payment service running on port ${PORT}`));
  })
  .catch((err) => {
    console.error('MongoDB connection failed:', err.message);
    process.exit(1);
  });