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

    // Generar PDF factura en memoria usando Promise para sincronizar
    const generarPDF = () => {
      return new Promise((resolve, reject) => {
        const doc = new PDFDocument();
        let buffers = [];

        doc.on('data', buffers.push.bind(buffers));
        doc.on('end', () => {
          const pdfData = Buffer.concat(buffers);
          resolve(pdfData);
        });
        doc.on('error', reject);

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
      });
    };

    const pdfData = await generarPDF();

    // Enviar email con PDF adjunto
    const mailOptions = {
      from: 'tuemail@gmail.com',
      to: emailCliente,
      subject: `Factura de compra - ${nombreCliente}`,
      text: `Gracias por tu compra, ${nombreCliente}. Adjuntamos tu factura.`,
      attachments: [{
        filename: 'factura.pdf',
        content: pdfData
      }]
    };

    await transporter.sendMail(mailOptions);

    res.json({ mensaje: 'Compra procesada y correo enviado' });

  } catch (error) {
    console.error('Error en compra:', error);
    res.status(500).json({ error: 'Error al procesar compra' });
  }
});

