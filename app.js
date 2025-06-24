const express = require('express');
const bodyParser = require('body-parser');
const admin = require('firebase-admin');
const nodemailer = require('nodemailer');
const PDFDocument = require('pdfkit');
const path = require('path');

// Configura Firebase usando variable de entorno
const serviceAccount = JSON.parse(process.env.FIREBASE_CREDENTIALS);

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const db = admin.firestore();

const app = express();
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, 'public')));

// Configura Nodemailer (en producción deberías usar variables de entorno para el correo)
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: 'izangagon@gmail.com',
    pass: 'vcvd uckn zvis keti'
  }
});

// GET productos
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

// POST compra con factura y envío por correo
app.post('/api/compra', async (req, res) => {
  const { emailCliente, nombreCliente, productos, total } = req.body;

  try {
    await db.collection('pedidos').add({
      emailCliente,
      nombreCliente,
      productos,
      total,
      fecha: admin.firestore.FieldValue.serverTimestamp(),
      estado: 'Pendiente'
    });

    const generarPDF = () => {
      return new Promise((resolve, reject) => {
        const doc = new PDFDocument();
        const buffers = [];

        doc.on('data', chunk => buffers.push(chunk));
        doc.on('end', () => resolve(Buffer.concat(buffers)));
        doc.on('error', reject);

        doc.fontSize(20).text('Factura de compra', { align: 'center' });
        doc.moveDown();
        doc.fontSize(14).text(`Cliente: ${nombreCliente}`);
        doc.text(`Email: ${emailCliente}`);
        doc.text(`Fecha: ${new Date().toLocaleString()}`);
        doc.moveDown();
        doc.text('Productos:');
        productos.forEach(p => {
          doc.text(`- ${p.nombre} x${p.cantidad} = $${(p.precio * p.cantidad).toFixed(2)}`);
        });
        doc.moveDown();
        doc.fontSize(16).text(`Total: $${total.toFixed(2)}`, { align: 'right' });
        doc.end();
      });
    };

    const pdfData = await generarPDF();

    const mailOptions = {
      from: 'izangagon@gmail.com',
      to: emailCliente,
      subject: `Factura de compra - ${nombreCliente}`,
      text: `Gracias por tu compra, ${nombreCliente}. Adjuntamos tu factura.`,
      attachments: [{
        filename: 'factura.pdf',
        content: pdfData
      }]
    };

    await transporter.sendMail(mailOptions);

    res.status(200).json({ mensaje: 'Compra procesada y correo enviado' });

  } catch (error) {
    console.error('Error al procesar la compra:', error);
    res.status(500).json({ error: 'Error al procesar compra' });
  }
});

// GET /api/pedidos - Lista todos los pedidos
app.get('/api/pedidos', async (req, res) => {
  try {
    const snapshot = await db.collection('pedidos').orderBy('fecha', 'desc').get();
    const pedidos = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    res.json(pedidos);
  } catch (error) {
    console.error('Error al obtener pedidos:', error);
    res.status(500).json({ error: 'Error al obtener pedidos' });
  }
});

// PATCH /api/pedidos/:id - Actualiza el estado del pedido
app.patch('/api/pedidos/:id', async (req, res) => {
  const { id } = req.params;
  const { nuevoEstado } = req.body;

  try {
    await db.collection('pedidos').doc(id).update({ estado: nuevoEstado });
    res.json({ mensaje: 'Estado del pedido actualizado' });
  } catch (error) {
    console.error('Error al actualizar estado del pedido:', error);
    res.status(500).json({ error: 'No se pudo actualizar el estado' });
  }
});

// DELETE /api/pedidos/:id - Elimina un pedido
app.delete('/api/pedidos/:id', async (req, res) => {
  const { id } = req.params;

  try {
    await db.collection('pedidos').doc(id).delete();
    res.json({ mensaje: 'Pedido eliminado correctamente' });
  } catch (error) {
    console.error('Error al eliminar pedido:', error);
    res.status(500).json({ error: 'No se pudo eliminar el pedido' });
  }
});

// Inicia el servidor
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`✅ Servidor corriendo en http://localhost:${PORT}`);
});
