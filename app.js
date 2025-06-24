const express = require('express');
const bodyParser = require('body-parser');
const admin = require('firebase-admin');
const nodemailer = require('nodemailer');
const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');

const app = express();
app.use(bodyParser.json());

// Inicializa Firebase Admin con tu archivo de servicio
const serviceAccount = require('./serviceAccountKey.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const db = admin.firestore();

// Configura nodemailer (Gmail)
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: 'tuemail@gmail.com',            // Cambia por tu email real
    pass: 'tu_contraseña_o_app_pw'        // Cambia por tu contraseña o app password
  }
});

// Endpoint login Firebase Admin para verificar token ID enviado desde frontend
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

// Endpoint para procesar compra y pago completado (frontend manda info)
app.post('/api/compra', async (req, res) => {
  const { emailCliente, nombreCliente, productos, total } = req.body;

  try {
    // Guardar pedido en Firestore
    const pedidoRef = await db.collection('pedidos').add({
      emailCliente,
      nombreCliente,
      productos,
      total,
      fecha: admin.firestore.FieldValue.serverTimestamp(),
      estado: 'Pendiente'
    });

    // Generar PDF factura (en memoria)
    const doc = new PDFDocument();
    let buffers = [];
    doc.on('data', buffers.push.bind(buffers));
    doc.on('end', async () => {
      const pdfData = Buffer.concat(buffers);

      // Aquí podrías guardar PDF en Storage o enviarlo por email directamente

      // Enviar email de confirmación
      const mailOptions = {
        from: 'tuemail@gmail.com',
        to: 'izangagon@gmail.com',
        subject: `Nuevo pedido de ${nombreCliente}`,
        text: `Pedido recibido:\nCliente: ${nombreCliente}\nEmail: ${emailCliente}\nTotal: $${total}`,
        attachments: [
          {
            filename: 'factura.pdf',
            content: pdfData
          }
        ]
      };
      await transporter.sendMail(mailOptions);
    });

    // Crear contenido PDF
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

    res.json({ mensaje: 'Compra procesada y correo enviado' });
  } catch (error) {
    console.error('Error en compra:', error);
    res.status(500).json({ error: 'Error al procesar compra' });
  }
});

// Iniciar servidor
const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
  console.log(`Servidor corriendo en puerto ${PORT}`);
});

