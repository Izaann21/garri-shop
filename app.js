require('dotenv').config();

const express = require('express');
const bodyParser = require('body-parser');
const admin = require('firebase-admin');
const nodemailer = require('nodemailer');
const PDFDocument = require('pdfkit');
const path = require('path');
const cors = require('cors');

// Inicializa Firebase
const serviceAccount = JSON.parse(process.env.FIREBASE_CREDENTIALS);
admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db = admin.firestore();

const app = express();
app.use(cors());
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, 'public')));

// Configura correo (desde variables de entorno)
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USUARIO,
    pass: process.env.EMAIL_CLAVE
  }
});

// Función para generar PDF de factura
const generarFacturaPDF = ({ nombreCliente, emailCliente, productos, total }) => {
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
      doc.text(`- ${p.nombre} x${p.cantidad} = €${(p.precio * p.cantidad).toFixed(2)}`);
    });
    doc.moveDown();
    doc.fontSize(16).text(`Total: €${total.toFixed(2)}`, { align: 'right' });
    doc.end();
  });
};

// Envía la factura por correo
const enviarFactura = async ({ nombreCliente, emailCliente, productos, total }) => {
  const pdf = await generarFacturaPDF({ nombreCliente, emailCliente, productos, total });

  const mailOptions = {
    from: process.env.EMAIL_USUARIO,
    to: emailCliente,
    subject: `Factura de compra – ${nombreCliente}`,
    text: `Gracias por tu compra, ${nombreCliente}. Adjuntamos tu factura.`,
    attachments: [{ filename: 'factura.pdf', content: pdf }]
  };

  await transporter.sendMail(mailOptions);
};

// Obtiene productos desde Firebase
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

// Registra una compra y envía la factura
app.post('/api/compra', async (req, res) => {
  const { emailCliente, nombreCliente, productos, total } = req.body;

  if (!emailCliente || !nombreCliente || !productos?.length) {
    return res.status(400).json({ error: 'Datos incompletos del pedido' });
  }

  try {
    await db.collection('pedidos').add({
      emailCliente,
      nombreCliente,
      productos,
      total,
      fecha: admin.firestore.FieldValue.serverTimestamp(),
      estado: 'Pendiente'
    });

    await enviarFactura({ emailCliente, nombreCliente, productos, total });

    res.status(200).json({ mensaje: 'Compra registrada y factura enviada' });
  } catch (error) {
    console.error('Error en la compra:', error);
    res.status(500).json({ error: 'Error al procesar la compra' });
  }
});

// Confirma el pago desde PayPal y guarda el pedido
app.post('/api/verificar-pago', async (req, res) => {
  const { emailCliente, nombreCliente, productos, total, paypalId } = req.body;

  if (!paypalId || !productos?.length) {
    return res.status(400).json({ error: 'Faltan datos del pago' });
  }

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

    await enviarFactura({ emailCliente, nombreCliente, productos, total });

    res.status(200).json({ mensaje: 'Pago confirmado y pedido registrado' });
  } catch (error) {
    console.error('Error al guardar pedido tras pago:', error);
    res.status(500).json({ error: 'Error en la confirmación del pago' });
  }
});

// Devuelve todos los pedidos
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

// Actualiza el estado de un pedido
app.patch('/api/pedidos/:id', async (req, res) => {
  const { id } = req.params;
  const { nuevoEstado } = req.body;

  try {
    await db.collection('pedidos').doc(id).update({ estado: nuevoEstado });
    res.json({ mensaje: 'Estado actualizado correctamente' });
  } catch (error) {
    console.error('Error al actualizar estado:', error);
    res.status(500).json({ error: 'No se pudo actualizar el estado del pedido' });
  }
});

// Elimina un pedido
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

// Inicia servidor
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`✅ Servidor corriendo en http://localhost:${PORT}`);
});

