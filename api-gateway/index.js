const express = require('express');
const { createProxyMiddleware } = require('http-proxy-middleware');
const cors = require('cors');

const app = express();
app.use(cors());

app.get('/', (req, res) => res.send('API Gateway is running...'));
app.get('/health', (req, res) => res.json({ status: 'ok', service: 'api-gateway' }));

const routes = [
  { path: '/users', target: process.env.USER_SERVICE_URL || 'http://localhost:3001', name: 'User' },
  { path: '/products', target: process.env.PRODUCT_SERVICE_URL || 'http://localhost:3002', name: 'Product' },
  { path: '/orders', target: process.env.ORDER_SERVICE_URL || 'http://localhost:3003', name: 'Order' },
  { path: '/cart', target: process.env.CART_SERVICE_URL || 'http://localhost:3004', name: 'Cart' },
  { path: '/payments', target: process.env.PAYMENT_SERVICE_URL || 'http://localhost:3005', name: 'Payment' },
  { path: '/notifications', target: process.env.NOTIFICATION_SERVICE_URL || 'http://localhost:3006', name: 'Notification' }
];

routes.forEach(({ path, target, name }) => {
  app.use(
    createProxyMiddleware({
      pathFilter: path,
      target,
      changeOrigin: true,
      on: {
        error: (err, req, res) => {
          res.status(502).json({ error: `${name} service unavailable` });
        }
      }
    })
  );
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`API Gateway running on port ${PORT}`));