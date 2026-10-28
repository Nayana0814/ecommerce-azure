const dns = require('dns');
dns.setServers(['8.8.8.8', '1.1.1.1']);

const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');

const app = express();
app.use(cors());
app.use(express.json());

const {
  USER_SERVICE_URL,
  PRODUCT_SERVICE_URL,
  CART_SERVICE_URL,
  PAYMENT_SERVICE_URL,
  NOTIFICATION_SERVICE_URL
} = process.env;

const orderSchema = new mongoose.Schema(
  {
    userId: { type: String, required: true },
    items: [
      {
        _id: false,
        productId: String,
        name: String,
        price: Number,
        quantity: Number
      }
    ],
    total: Number,
    status: { type: String, default: 'PENDING' },
    paymentId: String
  },
  { timestamps: true }
);

orderSchema.set('toJSON', {
  virtuals: true,
  versionKey: false,
  transform: (_, ret) => { delete ret._id; }
});

const Order = mongoose.model('Order', orderSchema);

// Shared flow used by both endpoints
async function placeOrder(userId, items, simulateFailure) {
  // 1. user must exist
  const userRes = await fetch(`${USER_SERVICE_URL}/users/${userId}`);
  if (userRes.status === 404) return { code: 404, body: { error: `User ${userId} not found` } };
  if (!userRes.ok) return { code: 502, body: { error: 'User service error' } };

  // 2. save the order as PENDING
  const total = items.reduce((s, i) => s + i.price * i.quantity, 0);
  const order = await Order.create({ userId, items, total, status: 'PENDING' });

  // 3. take payment
  let payment;
  try {
    const payRes = await fetch(`${PAYMENT_SERVICE_URL}/payments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        order_id: order.id,
        user_id: userId,
        amount: total,
        simulate_failure: !!simulateFailure
      })
    });
    payment = await payRes.json();
    if (!payRes.ok) throw new Error(payment.error || 'Payment error');
  } catch (err) {
    order.status = 'PAYMENT_ERROR';
    await order.save();
    return { code: 502, body: { error: 'Payment service unavailable', detail: err.message, order } };
  }

  order.paymentId = payment.id;

  if (payment.status !== 'SUCCESS') {
    order.status = 'PAYMENT_FAILED';
    await order.save();
    return { code: 402, body: { message: 'Payment failed', order, payment } };
  }

  order.status = 'PAID';
  await order.save();

  // 4. notify (an order should not fail just because notification is down)
  try {
    await fetch(`${NOTIFICATION_SERVICE_URL}/notifications`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        user_id: userId,
        order_id: order.id,
        message: `Order ${order.id} confirmed. Total: ${total}`
      })
    });
  } catch (err) {
    console.error('Notification failed:', err.message);
  }

  return { code: 201, body: { message: 'Order created!', orderId: order.id, order, payment } };
}

app.get('/', (req, res) => res.send('Order Service running...'));
app.get('/health', (req, res) => res.json({ status: 'ok', service: 'order-service' }));

// Single-product order (same body your old frontend sends)
app.post('/orders', async (req, res) => {
  const { user_id, product_id, simulate_payment_failure } = req.body;
  const quantity = parseInt(req.body.quantity) || 1;

  if (!user_id || !product_id) {
    return res.status(400).json({ error: 'user_id and product_id are required' });
  }

  try {
    const productRes = await fetch(`${PRODUCT_SERVICE_URL}/products/${product_id}`);
    if (productRes.status === 404) {
      return res.status(404).json({ error: `Product ${product_id} not found` });
    }
    if (!productRes.ok) return res.status(502).json({ error: 'Product service error' });
    const product = await productRes.json();

    const items = [{ productId: product_id, name: product.name, price: product.price, quantity }];
    const result = await placeOrder(user_id, items, simulate_payment_failure);
    res.status(result.code).json(result.body);
  } catch (err) {
    res.status(500).json({ error: 'Could not complete order', detail: err.message });
  }
});

// Order everything in the user's cart
app.post('/orders/checkout', async (req, res) => {
  const { user_id, simulate_payment_failure } = req.body;
  if (!user_id) return res.status(400).json({ error: 'user_id is required' });

  try {
    const cartRes = await fetch(`${CART_SERVICE_URL}/cart/${user_id}`);
    if (!cartRes.ok) return res.status(502).json({ error: 'Cart service error' });
    const cart = await cartRes.json();

    if (!cart.items || cart.items.length === 0) {
      return res.status(400).json({ error: 'Cart is empty' });
    }

    const result = await placeOrder(user_id, cart.items, simulate_payment_failure);

    if (result.code === 201) {
      await fetch(`${CART_SERVICE_URL}/cart/${user_id}`, { method: 'DELETE' }).catch(() => {});
    }
    res.status(result.code).json(result.body);
  } catch (err) {
    res.status(500).json({ error: 'Could not complete checkout', detail: err.message });
  }
});

app.get('/orders', async (req, res) => {
  const filter = req.query.user_id ? { userId: req.query.user_id } : {};
  const orders = await Order.find(filter).sort({ createdAt: -1 });
  res.json(orders);
});

app.get('/orders/:id', async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) {
    return res.status(404).json({ error: 'Order not found' });
  }
  const order = await Order.findById(req.params.id);
  if (!order) return res.status(404).json({ error: 'Order not found' });
  res.json(order);
});

const PORT = process.env.PORT || 3003;

mongoose
  .connect(process.env.MONGO_URI, { dbName: 'orderdb' })
  .then(() => {
    console.log('Connected to MongoDB (orderdb)');
    app.listen(PORT, () => console.log(`Order service running on port ${PORT}`));
  })
  .catch((err) => {
    console.error('MongoDB connection failed:', err.message);
    process.exit(1);
  });