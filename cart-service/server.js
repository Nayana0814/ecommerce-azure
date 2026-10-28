const dns = require('dns');
dns.setServers(['8.8.8.8', '1.1.1.1']);

const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');

const app = express();
app.use(cors());
app.use(express.json());

const PRODUCT_SERVICE_URL = process.env.PRODUCT_SERVICE_URL;

const cartSchema = new mongoose.Schema(
  {
    userId: { type: String, required: true, unique: true },
    items: [
      {
        _id: false,
        productId: { type: String, required: true },
        name: String,
        price: Number,
        quantity: { type: Number, default: 1, min: 1 }
      }
    ]
  },
  { timestamps: true }
);

const Cart = mongoose.model('Cart', cartSchema);

function formatCart(userId, cart) {
  const items = cart ? cart.items.map((i) => i.toObject()) : [];
  const total = items.reduce((sum, i) => sum + i.price * i.quantity, 0);
  return { userId, items, total };
}

app.get('/', (req, res) => res.send('Cart Service running...'));
app.get('/health', (req, res) => res.json({ status: 'ok', service: 'cart-service' }));

// View a user's cart
app.get('/cart/:userId', async (req, res) => {
  const cart = await Cart.findOne({ userId: req.params.userId });
  res.json(formatCart(req.params.userId, cart));
});

// Add an item (or increase its quantity)
app.post('/cart/:userId/items', async (req, res) => {
  const { userId } = req.params;
  const { product_id } = req.body;
  const quantity = parseInt(req.body.quantity) || 1;

  if (!product_id) {
    return res.status(400).json({ error: 'product_id is required' });
  }

  try {
    const productRes = await fetch(`${PRODUCT_SERVICE_URL}/products/${product_id}`);
    if (productRes.status === 404) {
      return res.status(404).json({ error: `Product ${product_id} not found` });
    }
    if (!productRes.ok) {
      return res.status(502).json({ error: 'Product service error' });
    }
    const product = await productRes.json();

    let cart = await Cart.findOne({ userId });
    if (!cart) cart = new Cart({ userId, items: [] });

    const existing = cart.items.find((i) => i.productId === product_id);
    if (existing) {
      existing.quantity += quantity;
    } else {
      cart.items.push({
        productId: product_id,
        name: product.name,
        price: product.price,
        quantity
      });
    }

    await cart.save();
    res.status(201).json(formatCart(userId, cart));
  } catch (err) {
    res.status(500).json({ error: 'Could not update cart', detail: err.message });
  }
});

// Remove one item
app.delete('/cart/:userId/items/:productId', async (req, res) => {
  const cart = await Cart.findOne({ userId: req.params.userId });
  if (!cart) return res.json(formatCart(req.params.userId, null));
  cart.items = cart.items.filter((i) => i.productId !== req.params.productId);
  await cart.save();
  res.json(formatCart(req.params.userId, cart));
});

// Clear the whole cart (used after an order is placed)
app.delete('/cart/:userId', async (req, res) => {
  await Cart.deleteOne({ userId: req.params.userId });
  res.json({ message: 'Cart cleared' });
});

const PORT = process.env.PORT || 3004;

mongoose
  .connect(process.env.MONGO_URI, { dbName: 'cartdb' })
  .then(() => {
    console.log('Connected to MongoDB (cartdb)');
    app.listen(PORT, () => console.log(`Cart service running on port ${PORT}`));
  })
  .catch((err) => {
    console.error('MongoDB connection failed:', err.message);
    process.exit(1);
  });