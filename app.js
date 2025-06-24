// Configuración de Firebase
const firebaseConfig = {
  apiKey: "TU_API_KEY",
  authDomain: "TU_AUTH_DOMAIN",
  projectId: "TU_PROJECT_ID",
  storageBucket: "TU_STORAGE_BUCKET",
  messagingSenderId: "TU_MESSAGING_SENDER_ID",
  appId: "TU_APP_ID"
};
firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();

// Mostrar productos
const container = document.getElementById("products");
db.collection("productos").get().then(snapshot => {
  snapshot.forEach(doc => {
    const data = doc.data();
    const div = document.createElement("div");
    div.className = "col-md-4";
    div.innerHTML = \`
      <div class="card mb-4 shadow-sm">
        <div class="card-body">
          <h5 class="card-title">\${data.nombre}</h5>
          <p class="card-text">\${data.descripcion}</p>
          <p class="card-text"><strong>\$ \${data.precio}</strong></p>
        </div>
      </div>
    \`;
    container.appendChild(div);
  });
});

// Integración con PayPal
paypal.Buttons({
  createOrder: function(data, actions) {
    return actions.order.create({
      purchase_units: [{
        amount: {
          value: '10.00' // Monto de prueba
        }
      }]
    });
  },
  onApprove: function(data, actions) {
    return actions.order.capture().then(function(details) {
      alert('Gracias por tu compra, ' + details.payer.name.given_name + '!');
    });
  }
}).render('#paypal-button-container');