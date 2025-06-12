import express from 'express';
import fs from 'fs';
import qr from 'qr-image';
import path from 'path';
import bodyParser from 'body-parser';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import pkg from 'pg';
const { Pool } = pkg;

dotenv.config();

const app = express();
const PORT = process.env.PORT || 8081;
const BASE_URL = process.env.BASE_URL || `http://localhost:${PORT}`;
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public/index.html'));
});

app.post('/submit', async (req, res) => {
  const { firstName, lastName, middleName, email, phone } = req.body;

  const client = await pool.connect();
  let uniqueToken;

  try {
    const insertQuery = `
  INSERT INTO registrations (first_name, last_name, middle_name, email, phone)
  VALUES ($1, $2, $3, $4, $5)
  RETURNING uuid;
`;
const result = await client.query(insertQuery, [
  firstName,
  lastName,
  middleName,
  email,
  phone
]);
uniqueToken = result.rows[0].uuid;
  } catch (err) {
    console.error('Ошибка при добавлении в базу:', err);
    return res.status(500).send('Ошибка сервера');
  } finally {
    client.release();
  }

  const fileName = `qr-${uniqueToken}.png`;
  const qrPath = path.join(__dirname, 'public', 'qrs', fileName);
  if (!fs.existsSync(path.join(__dirname, 'public', 'qrs'))) {
    fs.mkdirSync(path.join(__dirname, 'public', 'qrs'));
  }

  const qrUrl = `${BASE_URL}/verify?token=${uniqueToken}`;
  const qrImage = qr.image(qrUrl, { type: 'png' });
  qrImage.pipe(fs.createWriteStream(qrPath));

  res.redirect(`${BASE_URL}/show-qr?file=${fileName}`);
});

app.get('/show-qr', (req, res) => {
  const file = req.query.file;
  if (!file) return res.status(400).send('Файл не указан');

  res.send(`
    <!DOCTYPE html>
    <html lang="ru">
    <head>
      <meta charset="UTF-8">
      <title>Ваш QR-код</title>
      <meta name="viewport" content="width=device-width, initial-scale=1">
      <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/css/bootstrap.min.css" rel="stylesheet">
      <style>
        .toast-container {
          position: fixed;
          bottom: 1rem;
          right: 1rem;
          z-index: 1055;
        }
      </style>
    </head>
    <body class="bg-light">
      <main class="container">
        <div class="py-5 text-center">
          <h2>Регистрация прошла успешно!</h2>
          <p class="lead">Ниже находится ваш персональный QR-код</p>
        </div>

        <div class="row justify-content-center">
          <div class="col-md-7 col-lg-6">
            <div class="card shadow-sm mb-4">
              <div class="card-body text-center">
                <img src="/qrs/${file}" alt="QR-код" class="img-fluid mb-3" style="max-width: 300px;">
                <div>
                  <a href="/" class="btn btn-outline-primary">На главную</a>
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>

      <div class="toast-container">
        <div id="successToast" class="toast align-items-center text-bg-success border-0 show" role="alert" aria-live="assertive" aria-atomic="true">
          <div class="d-flex">
            <div class="toast-body">
              Регистрация прошла успешно!
            </div>
            <button type="button" class="btn-close btn-close-white me-2 m-auto" data-bs-dismiss="toast" aria-label="Закрыть"></button>
          </div>
        </div>
      </div>

      <script src="https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/js/bootstrap.bundle.min.js"></script>
      <script>
        const toastEl = document.getElementById('successToast');
        if (toastEl) {
          const toast = new bootstrap.Toast(toastEl, { delay: 3000 });
          toast.show();
        }
      </script>
    </body>
    </html>
  `);
});



app.get('/reader', (req, res) => {
  res.sendFile(path.join(__dirname, 'public/reader.html'));
});

app.get('/verify', async (req, res) => {
  const token = req.query.token;
  if (!token) return res.status(400).json({ status: 'error', message: 'Токен не указан' });

  const client = await pool.connect();
  try {
    const result = await client.query(
      'SELECT * FROM registrations WHERE uuid = $1',
      [token]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ status: 'error', message: 'Заявка не найдена' });
    }

    return res.json({ status: 'success', data: result.rows[0] });
  } catch (err) {
    console.error('Ошибка при поиске заявки:', err);
    return res.status(500).json({ status: 'error', message: 'Ошибка сервера' });
  } finally {
    client.release();
  }
});

  
app.get('/api/verify', async (req, res) => {
  const id = req.query.id;
  if (!id) return res.json({ status: 'error', message: 'ID не указан' });

  const client = await pool.connect();
  try {
    const result = await client.query('SELECT * FROM registrations WHERE id = $1', [id]);
    if (result.rows.length === 0) {
      return res.json({ status: 'error', message: 'Заявка не найдена' });
    }

    const registration = result.rows[0];

    await client.query(
      'INSERT INTO verification_logs (registration_id) VALUES ($1)',
      [id]
    );

    res.json({ status: 'success', data: registration });
  } catch (err) {
    console.error('Ошибка при верификации:', err);
    res.json({ status: 'error', message: 'Ошибка сервера' });
  } finally {
    client.release();
  }
});


app.listen(PORT, () => {
  console.log(`Сервер запущен на ${BASE_URL}`);
});
