const auth = firebase.auth();

// Login con Email y Password
function loginEmailPassword(email, password) {
  auth.signInWithEmailAndPassword(email, password)
    .then(userCredential => {
      console.log("Usuario logueado:", userCredential.user);
      // Aquí puedes mostrar el panel o guardar estado
    })
    .catch(error => {
      alert("Error al ingresar: " + error.message);
    });
}

// Registro con Email y Password
function registerEmailPassword(email, password) {
  auth.createUserWithEmailAndPassword(email, password)
    .then(userCredential => {
      console.log("Usuario registrado:", userCredential.user);
    })
    .catch(error => {
      alert("Error al registrar: " + error.message);
    });
}

// Login con Google
function loginGoogle() {
  const provider = new firebase.auth.GoogleAuthProvider();
  auth.signInWithPopup(provider)
    .then(result => {
      console.log("Usuario Google:", result.user);
    })
    .catch(error => {
      alert("Error Google login: " + error.message);
    });
}

// Detectar cambios en estado de autenticación
auth.onAuthStateChanged(user => {
  if(user) {
    console.log("Usuario conectado:", user.email);
    // Mostrar panel admin si es admin
  } else {
    console.log("No hay usuario logueado");
  }
});
if(user) {
  db.collection("usuarios").doc(user.uid).get().then(doc => {
    if(doc.exists && doc.data().rol === "admin") {
      // Mostrar panel admin
    }
  });
}
actions.order.capture().then(function(details) {
  const pedido = {
    userId: firebase.auth().currentUser.uid,
    nombreCliente: details.payer.name.given_name,
    emailCliente: details.payer.email_address,
    total: details.purchase_units[0].amount.value,
    fecha: new Date(),
    estado: "Pendiente",
   productos: [
  { nombre: "prueba", precio: 0.1, cantidad: 1 }
]
  };

  db.collection("pedidos").add(pedido)
    .then(() => alert('Gracias por tu compra, ' + details.payer.name.given_name + '!'))
    .catch(err => alert('Error guardando pedido: ' + err));
});

