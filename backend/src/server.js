require('dotenv').config();
const app = require('./app');

const PORT = process.env.PORT || 3000;

if (!process.env.JWT_SECRET){
  console.error('Falta JWT_SECRET en el archivo .env');
  process.exit(1);
}

app.listen(PORT, () => {
  console.log(`API escuchando en http://localhost:${PORT}`);
});