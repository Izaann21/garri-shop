const express = require('express');
const bodyParser = require('body-parser');
const admin = require('firebase-admin');
const nodemailer = require('nodemailer');
const PDFDocument = require('pdfkit');
const path = require('path');

// Inicializa Firebase Admin con tu archivo JSON descargado
const serviceAccount = require('./garri-shop-firebase-adminsdk-fbsvc-50611e6b00.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const db = admin.firestore();

const app = express();
app.use(bodyParser.json());

// Servir archivos estáticos frontend desde carpeta 'public' (crea esta carpeta y pon ahí tu HTML+JS)
app.use(express.static(path.join(__dirname, 'public')));

// Configura nodemailer (ejemplo con Gmail)
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: 'tuemail@gmail.com',           // Cambia aquí tu email real
    pass: 'tu_contraseña_o_app_pw'       // Cambia aquí tu contraseña o app password
  }
});

// API para obtener productos desde Firestore
app.get('/api/productos', async (req, res) => {
  try {
    const snapshot = await db.collection('productos').get();
    const productos = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    res.json(productos);
  } catch (error) {
    console.error('Error al obtener productos:', error);
    res.status(500).json({ error: 'Error al obtener productos' });
  }
});

// API login para verificar token ID enviado desde frontend
app.post('/api/login', async (req, res) => {
  const { idToken } = req.body;
  try {
    const decodedToken = await admin.auth().verifyIdToken(idToken);
    const uid = decodedToken.uid;
    const userRecord = await admin.auth().getUser(uid);
    res.json({ uid, email: userRecord.email });
  } catch (error) {
    res.status(401).json({ error: 'Token inválido' });
  }
});

// API para procesar compra y enviar correo con PDF
app.post('/api/compra', async (req, res) => {
  const { emailCliente, nombreCliente, productos, total } = req.body;

  try {
    // Guardar pedido en Firestore
    await db.collection('pedidos').add({
      emailCliente,
      nombreCliente,
      productos,
      total,
      fecha: admin.firestore.FieldValue.serverTimestamp(),
      estado: 'Pendiente'
    });

    // Generar PDF factura en memoria
    const doc = new PDFDocument();
    let buffers = [];
    doc.on('data', buffers.push.bind(buffers));
    doc.on('end', async () => {
      const pdfData = Buffer.concat(buffers);

      // Enviar email con PDF adjunto
      const mailOptions = {
        from: 'tuemail@gmail.com',
        to: emailCliente,   // enviamos al cliente
        subject: `Factura de compra - ${nombreCliente}`,
        text: `Gracias por tu compra, ${nombreCliente}. Adjuntamos tu factura.`,
        attachments: [{
          filename: 'factura.pdf',
          content: pdfData
        }]
      };

      await transporter.sendMail(mailOptions);
      res.json({ mensaje: 'Compra procesada y correo enviado' });
    });

    // Contenido del PDF
    doc.fontSize(20).text('Factura de compra', { align: 'center' });
    doc.moveDown();
    doc.fontSize(14).text(`Cliente: ${nombreCliente}`);
    doc.text(`Email: ${emailCliente}`);
    doc.text(`Fecha: ${new Date().toLocaleString()}`);
    doc.moveDown();
    doc.text('Productos:');
    productos.forEach(p => {
      doc.text(`- ${p.nombre} x${p.cantidad} = $${p.precio * p.cantidad}`);
    });
    doc.moveDown();
    doc.fontSize(16).text(`Total: $${total}`, { align: 'right' });
    doc.end();

  } catch (error) {
    console.error('Error en compra:', error);
    res.status(500).json({ error: 'Error al procesar compra' });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Servidor corriendo en http://localhost:${PORT}`);
});

