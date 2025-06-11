import express from 'express';
import fs from 'fs';
import qr from 'qr-image';
import path from 'path';
import bodyParser from 'body-parser';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
dotenv.config();

const app = express();
const PORT = 8081;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const BASE_URL = process.env.BASE_URL || `http://localhost:${PORT}`;

app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public/index.html'));
});

app.post('/submit', (req, res) => {
  const { firstName, lastName, middleName, email, phone } = req.body;
  const fullInfo = `ФИО: ${lastName} ${firstName} ${middleName}\nEmail: ${email}\nТелефон: ${phone}`;
  const fileName = `qr-${Date.now()}.png`;
  const qrPath = path.join(__dirname, 'public', 'qrs', fileName);

  if (!fs.existsSync(path.join(__dirname, 'public', 'qrs'))) {
    fs.mkdirSync(path.join(__dirname, 'public', 'qrs'));
  }

  const qrUrl = `${BASE_URL}/verify?name=${encodeURIComponent(lastName + ' ' + firstName + ' ' + middleName)}`;
  const qrImage = qr.image(qrUrl, { type: 'png' });
  qrImage.pipe(fs.createWriteStream(qrPath));

  const userData = {
    firstName,
    lastName,
    middleName,
    email,
    phone,
    registeredAt: new Date().toISOString()
  };

  const jsonPath = path.join(__dirname, 'registration.json');
  let registrations = [];

  if (fs.existsSync(jsonPath)) {
    try {
      const data = fs.readFileSync(jsonPath, 'utf8');
      registrations = JSON.parse(data);
    } catch (err) {
      console.error('Ошибка чтения registration.json:', err);
    }
  }

  registrations.push(userData);

  try {
    fs.writeFileSync(jsonPath, JSON.stringify(registrations, null, 2), 'utf8');
  } catch (err) {
    console.error('Ошибка записи в registration.json:', err);
  }

  res.redirect(`${BASE_URL}/show-qr?file=${fileName}`);
});

app.get('/show-qr', (req, res) => {
  const file = req.query.file;
  const qrUrl = `/qrs/${file}`;

  res.send(`
    <!DOCTYPE html>
    <html lang="ru">
    <head>
      <meta charset="UTF-8">
      <title>Ваш QR-код</title>
      <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/css/bootstrap.min.css" rel="stylesheet">
    </head>
    <body class="bg-light text-center p-5">
      <div class="container">
        <h2 class="mb-4">Спасибо за регистрацию!</h2>
        <p>Вот ваш QR-код:</p>
        <img src="${qrUrl}" alt="QR Code" style="width:200px; height:200px;">
        <br><br>
        <a href="/" class="btn btn-secondary mt-3">Назад</a>
      </div>
    </body>
    </html>
  `);
});

app.get('/verify', (req, res) => {
  const name = req.query.name || 'Пользователь';
  res.send(`
    <html><head><title>Подтверждение</title></head>
    <body style="font-family:sans-serif; text-align:center; margin-top: 50px">
      <h1> ${name} зарегистрирован(а) на форум</h1>
      <a href="/">Назад</a>
    </body></html>
  `);
});

app.listen(PORT, () => {
  console.log(`Сервер запущен на http://localhost:${PORT}`);
});
