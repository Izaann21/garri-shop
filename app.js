const express = require("express");
const path = require("path");
const app = express();
const PORT = process.env.PORT || 3000;

// Servir archivos estáticos como index.html, CSS, JS, imágenes, etc.
app.use(express.static(__dirname));

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

app.listen(PORT, () => {
  console.log(`Servidor corriendo en el puerto ${PORT}`);
});
