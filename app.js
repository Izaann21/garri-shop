require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');
const admin = require('firebase-admin');
const nodemailer = require('nodemailer');
const PDFDocument = require('pdfkit');
const path = require('path');
const cors = require('cors');

const app = express();

// 🔒 Configuración y Middlewares
app.use(cors());
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, 'public')));

// 🔐 Firebase
const serviceAccount = JSON.parse(process.env.FIREBASE_CREDENTIALS);
admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db = admin.firestore();

// 📧 Configura transporte de correo
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USUARIO,
    pass: process.env.EMAIL_CLAVE
  }
});

// 🔁 Utilidades
const esEmailValido = email => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

// 🧾 Generar factura PDF
const generarFacturaPDF = ({ nombreCliente, emailCliente, productos, total }) =>
  new Promise((resolve, reject) => {
    const doc = new PDFDocument();
    const buffers = [];

    doc.on('data', b => buffers.push(b));
    doc.on('end', () => resolve(Buffer.concat(buffers)));
    doc.on('error', reject);

    doc.fontSize(20).text('Factura de compra', { align: 'center' }).moveDown();
    doc.fontSize(14).text(`Cliente: ${nombreCliente}`);
    doc.text(`Email: ${emailCliente}`);
    doc.text(`Fecha: ${new Date().toLocaleString()}`).moveDown();
    productos.forEach(p =>
      doc.text(`- ${p.nombre} x${p.cantidad} = €${(p.precio * p.cantidad).toFixed(2)}`)
    );
    doc.moveDown();
    doc.fontSize(16).text(`Total: €${total.toFixed(2)}`, { align: 'right' });
    doc.end();
  });

// 📬 Enviar factura por correo
const enviarFactura = async ({ nombreCliente, emailCliente, productos, total }) => {
  const pdf = await generarFacturaPDF({ nombreCliente, emailCliente, productos, total });

  await transporter.sendMail({
    from: process.env.EMAIL_USUARIO,
    to: emailCliente,
    subject: `Factura - ${nombreCliente}`,
    text: `Gracias por tu compra, ${nombreCliente}. Adjuntamos tu factura.`,
    attachments: [{ filename: 'factura.pdf', content: pdf }]
  });
};

// 📦 ENDPOINTS

// 🛍 Productos
app.get('/api/productos', async (req, res, next) => {
  try {
    const snapshot = await db.collection('productos').get();
    const productos = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    res.json(productos);
  } catch (e) {
    next(e);
  }
});

app.post('/api/productos', async (req, res, next) => {
  const { nombre, precio, imagen, adminToken } = req.body;
  if (adminToken !== process.env.ADMIN_TOKEN) return res.status(401).json({ error: 'No autorizado' });

  try {
    const doc = await db.collection('productos').add({ nombre, precio, imagen });
    res.status(201).json({ id: doc.id });
  } catch (e) {
    next(e);
  }
});

app.patch('/api/productos/:id', async (req, res, next) => {
  const { adminToken } = req.body;
  if (adminToken !== process.env.ADMIN_TOKEN) return res.status(401).json({ error: 'No autorizado' });

  try {
    await db.collection('productos').doc(req.params.id).update(req.body);
    res.json({ mensaje: 'Producto actualizado' });
  } catch (e) {
    next(e);
  }
});

app.delete('/api/productos/:id', async (req, res, next) => {
  const { adminToken } = req.body;
  if (adminToken !== process.env.ADMIN_TOKEN) return res.status(401).json({ error: 'No autorizado' });

  try {
    await db.collection('productos').doc(req.params.id).delete();
    res.json({ mensaje: 'Producto eliminado' });
  } catch (e) {
    next(e);
  }
});

// 💰 Compras y pagos
app.post('/api/compra', async (req, res, next) => {
  const { emailCliente, nombreCliente, productos, total } = req.body;
  if (!nombreCliente || !emailCliente || !esEmailValido(emailCliente) || !productos?.length)
    return res.status(400).json({ error: 'Datos inválidos' });

  try {
    await db.collection('pedidos').add({
      emailCliente,
      nombreCliente,
      productos,
      total,
      fecha: admin.firestore.FieldValue.serverTimestamp(),
      estado: 'Pendiente'
    });

    await enviarFactura({ nombreCliente, emailCliente, productos, total });
    await db.collection('logs').add({ evento: 'compra', emailCliente, nombreCliente, total, fecha: new Date() });
    res.status(200).json({ mensaje: 'Compra registrada' });
  } catch (e) {
    next(e);
  }
});

app.post('/api/verificar-pago', async (req, res, next) => {
  const { emailCliente, nombreCliente, productos, total, paypalId } = req.body;
  if (!paypalId || !productos?.length || !esEmailValido(emailCliente))
    return res.status(400).json({ error: 'Pago no válido' });

  try {
    await db.collection('pedidos').add({
      emailCliente,
      nombreCliente,
      productos,
      total,
      paypalId,
      fecha: admin.firestore.FieldValue.serverTimestamp(),
      estado: 'Confirmado'
    });

    await enviarFactura({ nombreCliente, emailCliente, productos, total });
    await db.collection('logs').add({ evento: 'pago confirmado', emailCliente, total, fecha: new Date() });
    res.status(200).json({ mensaje: 'Pago verificado' });
  } catch (e) {
    next(e);
  }
});

// 📥 Contacto
app.post('/api/contacto', async (req, res, next) => {
  const { nombre, email, mensaje } = req.body;
  if (!nombre || !email || !mensaje || !esEmailValido(email))
    return res.status(400).json({ error: 'Datos inválidos en contacto' });

  try {
    await transporter.sendMail({
      from: email,
      to: process.env.EMAIL_USUARIO,
      subject: `📬 Nuevo mensaje – ${nombre}`,
      text: mensaje
    });
    res.json({ mensaje: 'Mensaje enviado correctamente' });
  } catch (e) {
    next(e);
  }
});

// 📊 Estadísticas
app.get('/api/estadisticas', async (req, res, next) => {
  try {
    const pedidosSnap = await db.collection('pedidos').get();
    const totalVentas = pedidosSnap.docs.reduce((acc, doc) => acc + (doc.data().total || 0), 0);
    const totalPedidos = pedidosSnap.size;

    res.json({ totalPedidos, totalVentas });
  } catch (e) {
    next(e);
  }
});

// 💌 Newsletter
app.post('/api/newsletter', async (req, res, next) => {
  const { asunto, mensaje, adminToken } = req.body;
  if (adminToken !== process.env.ADMIN_TOKEN) return res.status(401).json({ error: 'No autorizado' });

  try {
    const usuariosSnap = await db.collection('subscriptores').get();
    const emails = usuariosSnap.docs.map(doc => doc.data().email);

    for (const email of emails) {
      await transporter.sendMail({
        from: process.env.EMAIL_USUARIO,
        to: email,
        subject: asunto,
        text: mensaje
      });
    }

    await db.collection('logs').add({ evento: 'newsletter enviada', asunto, fecha: new Date() });
    res.json({ mensaje: 'Newsletter enviada a todos los subscriptores' });
  } catch (e) {
    next(e);
  }
});

// 🚨 Errores globales
app.use((err, req, res, next) => {
  console.error('❌ Error:', err.message);
  res.status(500).json({ error: 'Error interno del servidor' });
});

// 🔊 Iniciar servidor
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`✅ Servidor activo en http://localhost:${PORT}`);
});
