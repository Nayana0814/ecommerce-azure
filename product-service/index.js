const dns = require('dns');
dns.setServers(['8.8.8.8', '1.1.1.1']);
const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');

const app = express();
app.use(cors());
app.use(express.json());

const productSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    price: { type: Number, required: true, min: 0 },
    description: { type: String, default: '' },
    stock: { type: Number, default: 100, min: 0 }
  },
  { timestamps: true }
);

productSchema.set('toJSON', {
  virtuals: true,
  versionKey: false,
  transform: (_, ret) => { delete ret._id; }
});

const Product = mongoose.model('Product', productSchema);

const validId = (id) => mongoose.isValidObjectId(id);

app.get('/', (req, res) => res.send('Product Service running...'));
app.get('/health', (req, res) => res.json({ status: 'ok', service: 'product-service' }));

app.post('/products', async (req, res) => {
  try {
    const { name, price, description, stock } = req.body;
    if (!name || price === undefined || price === null) {
      return res.status(400).json({ error: 'name and price are required' });
    }
    const product = await Product.create({ name, price, description, stock });
    res.status(201).json({ message: 'Product created!', productId: product.id, product });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.get('/products', async (req, res) => {
  const products = await Product.find().sort({ createdAt: -1 });
  res.json(products);
});

app.get('/products/:id', async (req, res) => {
  if (!validId(req.params.id)) return res.status(404).json({ error: 'Product not found' });
  const product = await Product.findById(req.params.id);
  if (!product) return res.status(404).json({ error: 'Product not found' });
  res.json(product);
});

app.put('/products/:id', async (req, res) => {
  if (!validId(req.params.id)) return res.status(404).json({ error: 'Product not found' });
  try {
    const product = await Product.findByIdAndUpdate(req.params.id, req.body, {
      new: true,
      runValidators: true
    });
    if (!product) return res.status(404).json({ error: 'Product not found' });
    res.json(product);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.delete('/products/:id', async (req, res) => {
  if (!validId(req.params.id)) return res.status(404).json({ error: 'Product not found' });
  const product = await Product.findByIdAndDelete(req.params.id);
  if (!product) return res.status(404).json({ error: 'Product not found' });
  res.json({ message: 'Product deleted' });
});

const PORT = process.env.PORT || 3002;

mongoose
  .connect(process.env.MONGO_URI, { dbName: 'productdb' })
  .then(() => {
    console.log('Connected to MongoDB (productdb)');
    app.listen(PORT, () => console.log(`Product service running on port ${PORT}`));
  })
  .catch((err) => {
    console.error('MongoDB connection failed:', err.message);
    process.exit(1);
  });