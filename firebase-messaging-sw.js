// firebase-messaging-sw.js
importScripts('https://www.gstatic.com/firebasejs/9.23.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/9.23.0/firebase-messaging-compat.js');

firebase.initializeApp({
  apiKey: "AIzaSyDbVJk5nIK3Ltth3ibdERPmMzT8BXmeiUk",
  authDomain: "salah-tracker2.firebaseapp.com",
  projectId: "salah-tracker2",
  messagingSenderId: "1051833345706",
  appId: "1:1051833345706:web:40977957e6bf792b1552d3"
});

const messaging = firebase.messaging();

messaging.onBackgroundMessage(function(payload) {
  console.log('[firebase-messaging-sw.js] Received background message ', payload);
  const notificationTitle = payload.notification.title;
  const notificationOptions = {
    body: payload.notification.body,
    icon: '/icon-192.png' // Optional: path to your app icon
  };
  self.registration.showNotification(notificationTitle, notificationOptions);
}); 